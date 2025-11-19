import { DataView, DataViewRow, DataViewHierarchyNode, DataViewColorInfo } from "spotfire-api";
import { getLuminance } from "polished";
import { select, hierarchy, partition, HierarchyRectangularNode } from "d3";

interface Card {
    timePosition: number;
    verticalPosition: number;
    title: string;
    description: string;
    color: DataViewColorInfo;
    row: DataViewRow;
}

interface Rect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * Constants for large dataset handling
 */
const timeAxisName = "Time",
    descriptionAxisName = "Event",
    verticalSpaceBetweenCards = 12.5,
    horizontalSpaceBetweenCards = 12.5,
    rowsPerCard = 2,
    maxTimeSegments = 50000,
    VIEWPORT_BUFFER = 2,
    PERFORMANCE_MODE_THRESHOLD = 5000;

/**
 * Set up drawing layers
 */
const modContainer = select("#mod-container");
const drawingLayer = modContainer.append("div").attr("id", "drawingLayer");
const connectorContainer = drawingLayer.append("div").attr("id", "connectors");
const cardContainer = drawingLayer.append("div").attr("id", "cards");
const timeline = drawingLayer.append("div").attr("class", "timeline");
const markingOverlay = modContainer.append("div").attr("id", "markingOverlay").attr("class", "inactiveMarking");

// State Management
const state = {
    selection: { x1: 0, y1: 0, x2: 0, y2: 0 } as Rect,
    zoomLevel: 1.0,
    dataView: null as DataView | null,
    windowSize: null as Spotfire.Size | null,
    allCards: [] as Card[],
    timeLeaves: [] as DataViewHierarchyNode[],
    timeHierarchyDepth: 0,
    hierarchyRoot: null as DataViewHierarchyNode | null,
    isZooming: false,
    performanceMode: false,
    visibleCardCount: 0,
    viewportLeft: 0,
    viewportRight: 0
};

window.Spotfire.initialize(async (mod) => {
    const context = mod.getRenderContext();
    const fontSize = parseInt(context.styling.general.font.fontSize.toString());

    const baseCardHeight = fontSize * rowsPerCard * 1.5;
    const baseTimelineLevelHeight = fontSize * 2;
    const baseMinimumTimeSegmentWidth = fontSize * 4;
    const baseCardWidth = 3.2 * baseMinimumTimeSegmentWidth;
    let autoScroll = false;
    const autoScrollSpeed = 5;

    document.querySelector("#extra_styling")!.innerHTML = `
    .body { fill: ${context.styling.general.font.color}; font-size: ${context.styling.general.font.fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .timeMarker {border-color: ${context.styling.scales.line.stroke}} 
    .timeline {border-color: ${context.styling.scales.line.stroke}} 
    .connector {background-color: ${context.styling.scales.line.stroke}}
    `;

    const reader = mod.createReader(mod.visualization.data(), mod.windowSize());

    reader.subscribe(generalErrorHandler(mod, 50000)(onChange), (err) => {
        mod.controls.errorOverlay.show(err);
    });

    // Zoom Logic
    let scrollTimeout: number | null = null;
    let indicatorTimeout: number | null = null;
    const containerElement = modContainer.node() as HTMLElement;
    const zoomIndicator = document.getElementById("zoom-indicator");
    const zoomInstructions = document.getElementById("zoom-instructions");
    let hasUsedZoom = false;

    function showZoomIndicator() {
        if (!zoomIndicator) return;
        
        if (!hasUsedZoom && zoomInstructions) {
            hasUsedZoom = true;
            setTimeout(() => {
                if (zoomInstructions) {
                    zoomInstructions.style.opacity = '0';
                    setTimeout(() => {
                        if (zoomInstructions) {
                            zoomInstructions.style.display = 'none';
                        }
                    }, 300);
                }
            }, 2000);
        }
        
        const zoomPercent = Math.round(state.zoomLevel * 100);
        let aggregationLevel = "All Details";
        
        if (state.zoomLevel < 0.3) aggregationLevel = "Yearly View";
        else if (state.zoomLevel < 0.6) aggregationLevel = "Quarterly View";
        else if (state.zoomLevel < 1.0) aggregationLevel = "Monthly View";
        else if (state.zoomLevel >= 2.0) aggregationLevel = "Daily View";
        
        zoomIndicator.textContent = `Zoom: ${zoomPercent}% • ${aggregationLevel}`;
        zoomIndicator.classList.add("visible");
        
        if (indicatorTimeout !== null) clearTimeout(indicatorTimeout);
        indicatorTimeout = window.setTimeout(() => {
            zoomIndicator.classList.remove("visible");
            indicatorTimeout = null;
        }, 1500);
    }

    if (containerElement) {
        containerElement.addEventListener("wheel", (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                
                if (state.isZooming || !state.dataView || !state.windowSize) return;
                
                const rect = containerElement.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const scrollLeft = containerElement.scrollLeft;
                const zoomPointX = scrollLeft + mouseX;
                
                const zoomDelta = event.deltaY < 0 ? 0.05 : -0.05;
                const oldZoomLevel = state.zoomLevel;
                state.zoomLevel = Math.max(0.2, Math.min(10.0, state.zoomLevel + zoomDelta));
                
                if (Math.abs(oldZoomLevel - state.zoomLevel) < 0.001) return;
                
                showZoomIndicator();
                if (scrollTimeout !== null) clearTimeout(scrollTimeout);
                
                state.isZooming = true;
                scrollTimeout = window.setTimeout(() => {
                    draw().then(() => {
                        const zoomRatio = state.zoomLevel / oldZoomLevel;
                        const newScrollLeft = zoomPointX * zoomRatio - mouseX;
                        containerElement.scrollLeft = Math.max(0, newScrollLeft);
                        state.isZooming = false;
                        scrollTimeout = null;
                    }).catch(() => {
                        state.isZooming = false;
                        scrollTimeout = null;
                    });
                }, 30);
            }
        }, { passive: false });
        
        containerElement.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
        containerElement.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
    }

    async function onChange(dataView: DataView, windowSize: Spotfire.Size) {
        state.dataView = dataView;
        state.windowSize = windowSize;
        await processData(dataView);
        await draw();
    }

    async function processData(dataView: DataView) {
        const hasTime = !!(await dataView.categoricalAxis(timeAxisName));
        const hasDescription = !!(await dataView.categoricalAxis(descriptionAxisName));

        if (!hasTime) {
            state.timeLeaves = [];
            state.allCards = [];
            return;
        }

        state.timeLeaves = (await (await dataView.hierarchy(timeAxisName))?.root())?.leaves() || [];
        
        if (state.timeLeaves.length > maxTimeSegments) {
            mod.controls.errorOverlay.show(
                `⚠️ Dataset too large: ${state.timeLeaves.length.toLocaleString()} time segments (max: ${maxTimeSegments.toLocaleString()}).`,
                "DataSize"
            );
            state.timeLeaves = [];
            state.allCards = [];
            return;
        }
        mod.controls.errorOverlay.hide("DataSize");

        const timeHierarchy = await dataView.hierarchy(timeAxisName);
        state.timeHierarchyDepth = timeHierarchy?.levels.length || 0;
        state.hierarchyRoot = (await timeHierarchy?.root()) ?? null;

        if (!state.hierarchyRoot) return;

        const rawCards: any[] = [];
        state.timeLeaves.forEach((node) => {
            node.rows().forEach((row) => {
                if (row.categorical(descriptionAxisName).formattedValue() != "") {
                    rawCards.push({
                        description: hasDescription ? row.categorical(descriptionAxisName).formattedValue() : "",
                        timePosition: row.categorical(timeAxisName).leafIndex,
                        color: row.color(),
                        row: row
                    });
                }
            });
        });
        
        state.allCards = rawCards as Card[];
        state.performanceMode = state.allCards.length > PERFORMANCE_MODE_THRESHOLD;
    }

    async function draw() {
        if (!state.dataView || !state.windowSize || !state.hierarchyRoot) {
            drawingLayer.selectAll("*").remove();
            return;
        }

        const renderStartTime = performance.now();
        const windowSize = state.windowSize;

        const cardHeight = baseCardHeight;
        const timelineLevelHeight = baseTimelineLevelHeight;
        const minimumTimeSegmentWidth = baseMinimumTimeSegmentWidth;
        const cardWidth = baseCardWidth;
        const timeSegmentMargin = cardWidth / 2;

        let timeMarkerWidth = (windowSize.width - timeSegmentMargin * 2) / state.timeLeaves.length;
        timeMarkerWidth = Math.max(timeMarkerWidth, minimumTimeSegmentWidth) * state.zoomLevel;
        
        const timeSegmentsPerCard = Math.ceil((cardWidth + horizontalSpaceBetweenCards) / timeMarkerWidth);
        const timeLineTop = windowSize.height / 2 - (timelineLevelHeight * state.timeHierarchyDepth) / 2;
        const drawingAreaHeight = windowSize.height - 35;
        const drawingAreaWidth = state.timeLeaves.length * timeMarkerWidth + timeSegmentMargin * 2 - 10;
        const timelineWidth = state.timeLeaves.length * timeMarkerWidth;
        const timelineHeight = (state.timeHierarchyDepth + 1) * timelineLevelHeight;

        const lastPosition = new Map<number, number>();
        let maxStackedCards = 0;
        
        state.allCards.forEach(card => {
            let vp = 0;
            while (lastPosition.has(vp) && card.timePosition - lastPosition.get(vp)! < timeSegmentsPerCard) {
                vp++;
            }
            lastPosition.set(vp, card.timePosition);
            card.verticalPosition = vp;
            maxStackedCards = Math.max(maxStackedCards, vp + 1);
        });

        let cardSpacing = cardHeight + 4 + verticalSpaceBetweenCards;
        const totalSpaceRequired = cardSpacing * (2 * Math.ceil(maxStackedCards / 2)) + timelineLevelHeight * state.timeHierarchyDepth;
        
        if (totalSpaceRequired > windowSize.height) {
             cardSpacing = (windowSize.height - timelineLevelHeight * state.timeHierarchyDepth - (cardHeight + 4) * 2) / (2 * Math.ceil(maxStackedCards / 2));
        }

        drawingLayer
            .style("height", `${drawingAreaHeight}px`)
            .style("width", `${drawingAreaWidth}px`)
            .on("mousedown", mouseDownHandler)
            .on("dblclick", doubleclickHandler);

        if (containerElement) {
            const scrollLeft = containerElement.scrollLeft;
            const viewportWidth = containerElement.clientWidth;
            const bufferWidth = viewportWidth * VIEWPORT_BUFFER;
            state.viewportLeft = Math.max(0, scrollLeft - bufferWidth - timeSegmentMargin);
            state.viewportRight = scrollLeft + viewportWidth + bufferWidth;
        }

        const visibleCards = state.performanceMode 
            ? state.allCards.filter(c => {
                const left = timeSegmentMargin + c.timePosition * timeMarkerWidth - cardWidth / 2 + timeMarkerWidth / 2;
                return (left + cardWidth) >= state.viewportLeft && left <= state.viewportRight;
            })
            : state.allCards;
            
        state.visibleCardCount = visibleCards.length;

        const getCardLeft = (d: Card) => timeSegmentMargin + d.timePosition * timeMarkerWidth - cardWidth / 2 + timeMarkerWidth / 2;
        const getCardTop = (vp: number) => {
            let top = timeLineTop;
            const group = vp % 2;
            const lane = Math.floor(vp / 2);
            if (group === 0) top = top - verticalSpaceBetweenCards - lane * cardSpacing - cardHeight;
            else top = top + timelineLevelHeight * state.timeHierarchyDepth + lane * cardSpacing + verticalSpaceBetweenCards;
            return top;
        };
        const getConnectorTop = (vp: number) => {
            let top = timeLineTop;
            const group = vp % 2;
            const lane = Math.floor(vp / 2);
            if (group === 0) top = top - verticalSpaceBetweenCards - lane * cardSpacing;
            else top = top + timelineLevelHeight * state.timeHierarchyDepth + 3;
            return top;
        };
        const getConnectorHeight = (d: Card) => {
            const group = d.verticalPosition % 2;
            const lane = Math.floor(d.verticalPosition / 2);
            if (group === 0) return lane * cardSpacing + verticalSpaceBetweenCards;
            return verticalSpaceBetweenCards + lane * cardSpacing - 3;
        };

        connectorContainer.selectAll(".connector")
            .data(visibleCards, (d: any) => d.row.elementId(true))
            .join("div")
            .attr("class", "connector")
            .style("left", d => `${timeSegmentMargin + d.timePosition * timeMarkerWidth + timeMarkerWidth / 2}px`)
            .style("top", d => `${getConnectorTop(d.verticalPosition)}px`)
            .style("height", d => `${getConnectorHeight(d)}px`);

        cardContainer.selectAll(".card")
            .data(visibleCards, (d: any) => d.row.elementId(true))
            .join("div")
            .attr("class", "card")
            .classed("card-marked", d => d.row.isMarked())
            .on("click", (e, d) => {
                d.row.mark(e.ctrlKey || e.metaKey ? "ToggleOrAdd" : "Replace");
                e.stopPropagation();
            })
            .text(d => d.description)
            .style("left", d => `${getCardLeft(d)}px`)
            .style("top", d => `${getCardTop(d.verticalPosition)}px`)
            .style("height", `${cardHeight}px`)
            .style("width", `${cardWidth}px`)
            .style("background-color", d => d.color.hexCode)
            .style("color", d => contrastColor(d.color.hexCode));

        cardContainer.selectAll(".card").filter((d: any) => d.row.isMarked()).raise();

        timeline
            .style("left", `${timeSegmentMargin}px`)
            .style("top", `${timeLineTop}px`)
            .style("width", `${state.timeLeaves.length * timeMarkerWidth + 2}px`)
            .style("height", `${timelineLevelHeight * state.timeHierarchyDepth + 2}px`);

        const rootHierarchy = hierarchy(state.hierarchyRoot);
        rootHierarchy.sum((d: any) => (!d?.children && 1) || 0);

        const partitionLayout = partition<DataViewHierarchyNode>()
            .size([timelineWidth, timelineHeight])
            .padding(0)
            .round(false);
            
        const partitionedRoot = partitionLayout(rootHierarchy as any) as HierarchyRectangularNode<DataViewHierarchyNode>;

        let maxDisplayLevel = state.timeHierarchyDepth - 1;
        if (state.zoomLevel < 0.3) maxDisplayLevel = Math.min(0, state.timeHierarchyDepth - 1);
        else if (state.zoomLevel < 0.6) maxDisplayLevel = Math.min(1, state.timeHierarchyDepth - 1);
        else if (state.zoomLevel < 1.0) maxDisplayLevel = Math.min(2, state.timeHierarchyDepth - 1);

        const displayHierarchy = partitionedRoot.descendants().filter(d => d.parent && d.data.level <= maxDisplayLevel);

        timeline.selectAll(".timeMarker")
            .data(displayHierarchy)
            .join("div")
            .attr("class", "timeMarker")
            .classed("timeMarker-left", d => d.x0 === 0)
            .classed("timeMarker-top", d => d.data.level === 0)
            .on("click", (e, d) => {
                d.data.mark(e.ctrlKey || e.metaKey ? "ToggleOrAdd" : "Replace");
                e.stopPropagation();
            })
            .text(d => d.data.formattedValue())
            .style("left", d => `${d.x0}px`)
            .style("width", d => `${d.x1 - d.x0 - 5}px`)
            .style("top", d => `${d.y0 - timelineLevelHeight}px`)
            .style("height", d => `${d.y1 - d.y0}px`);

        if (state.performanceMode && containerElement) {
            containerElement.removeEventListener("scroll", handleScroll);
            containerElement.addEventListener("scroll", handleScroll);
        }

        const renderTime = performance.now() - renderStartTime;
        updatePerformanceStats(renderTime);
        
        context.signalRenderComplete();

        function handleScroll() {
            if (!state.performanceMode || !state.dataView || !state.windowSize) return;
            requestAnimationFrame(() => {
                draw();
            });
        }

        function doubleclickHandler(event: MouseEvent) {
            if (event.ctrlKey || event.metaKey) {
                autoScroll = !autoScroll;
                if (autoScroll) scroll();
            }
        }

        function scroll() {
            if (!containerElement) return;
            let currentScroll = containerElement.scrollLeft;
            if (autoScroll && currentScroll < timelineWidth - windowSize.width) {
                containerElement.scrollLeft = currentScroll + 1;
                setTimeout(scroll, autoScrollSpeed);
            }
        }

        function mouseDownHandler(event: MouseEvent) {
            const scrollLeft = containerElement?.scrollLeft || 0;
            const scrollTop = containerElement?.scrollTop || 0;
            state.selection = {
                x1: event.clientX + scrollLeft,
                y1: event.clientY + scrollTop,
                x2: event.clientX + scrollLeft,
                y2: event.clientY + scrollTop
            };
            document.addEventListener("mousemove", mouseMoveHandler);
            document.addEventListener("mouseup", mouseUpHandler);
        }

        function mouseMoveHandler(event: MouseEvent) {
            const scrollLeft = containerElement?.scrollLeft || 0;
            const scrollTop = containerElement?.scrollTop || 0;
            state.selection.x2 = event.clientX + scrollLeft;
            state.selection.y2 = event.clientY + scrollTop;

            markingOverlay
                .attr("class", "activeMarking")
                .style("left", `${state.selection.x2 > state.selection.x1 ? state.selection.x1 : state.selection.x2}`)
                .style("top", `${state.selection.y2 > state.selection.y1 ? state.selection.y1 : state.selection.y2}`)
                .style("width", `${Math.abs(state.selection.x2 - state.selection.x1)}`)
                .style("height", `${Math.abs(state.selection.y2 - state.selection.y1)}`);
        }

        function mouseUpHandler(event: MouseEvent) {
            markingOverlay
                .style("left", `${0}`)
                .style("top", `${0}`)
                .style("width", `${0}`)
                .style("height", `${0}`)
                .attr("class", "inactiveMarking");

            let selectedCards = cardContainer.selectAll<HTMLDivElement, Card>(".card").filter((c: Card) => {
                let x1 = getCardLeft(c);
                let y1 = getCardTop(c.verticalPosition);
                let cardRect: Rect = {
                    x1: x1,
                    y1: y1,
                    x2: x1 + cardWidth,
                    y2: y1 + cardHeight
                };

                if (state.selection.x1 > state.selection.x2) {
                    [state.selection.x1, state.selection.x2] = [state.selection.x2, state.selection.x1];
                }
                if (state.selection.y1 > state.selection.y2) {
                    [state.selection.y1, state.selection.y2] = [state.selection.y2, state.selection.y1];
                }

                return intersect(cardRect, state.selection);
            });

            if (selectedCards.size() > 0) {
                selectedCards.each((c: Card) => {
                    c.row.mark(event.ctrlKey || event.metaKey ? "ToggleOrAdd" : "Replace");
                });
                event.stopPropagation();
            } else {
                state.dataView?.clearMarking();
            }

            document.removeEventListener("mousemove", mouseMoveHandler);
            document.removeEventListener("mouseup", mouseUpHandler);
        }
    }

    function updatePerformanceStats(renderTime: number) {
        const perfStats = document.getElementById("performance-stats");
        if (!perfStats) return;

        if (state.allCards.length > PERFORMANCE_MODE_THRESHOLD) {
            perfStats.classList.add("visible");
            
            const renderTimeClass = renderTime < 50 ? 'stat-good' : renderTime < 100 ? 'stat-warning' : 'stat-bad';
            const reductionPercent = state.allCards.length > 0 
                ? Math.round((1 - state.visibleCardCount / state.allCards.length) * 100)
                : 0;
            
            perfStats.innerHTML = `
                <div><span class="stat-label">Total Cards:</span><span class="stat-value">${state.allCards.length.toLocaleString()}</span></div>
                <div><span class="stat-label">Rendered:</span><span class="stat-value">${state.visibleCardCount.toLocaleString()}</span></div>
                <div><span class="stat-label">Culled:</span><span class="stat-value stat-good">${reductionPercent}%</span></div>
                <div><span class="stat-label">Render Time:</span><span class="stat-value ${renderTimeClass}">${renderTime.toFixed(1)}ms</span></div>
                <div><span class="stat-label">Mode:</span><span class="stat-value">${state.performanceMode ? '⚡ High-Perf' : '🎨 Normal'}</span></div>
                <div><span class="stat-label">Zoom:</span><span class="stat-value">${Math.round(state.zoomLevel * 100)}%</span></div>
            `;
        } else {
            perfStats.classList.remove("visible");
        }
    }
});

/**
 * subscribe callback wrapper with general error handling, row count check and an early return when the data has become invalid while fetching it.
 *
 * The only requirement is that the dataview is the first argument.
 * @param mod - The mod API, used to show error messages.
 * @param rowLimit - Optional row limit.
 */
export function generalErrorHandler<T extends (dataView: Spotfire.DataView, ...args: any) => any>(
    mod: Spotfire.Mod,
    rowLimit = 50000 // Increased from 2000 to 50000 for large datasets
): (a: T) => T {
    return function (callback: T) {
        return async function callbackWrapper(dataView: Spotfire.DataView, ...args: any) {
            try {
                const errors = await dataView.getErrors();
                if (errors.length > 0) {
                    mod.controls.errorOverlay.show(errors, "DataView");
                    return;
                }
                mod.controls.errorOverlay.hide("DataView");

                /**
                 * Hard abort if row count exceeds an arbitrary selected limit
                 */
                const rowCount = await dataView.rowCount();
                if (rowCount && rowCount > rowLimit) {
                    mod.controls.errorOverlay.show(
                        `☹️ Cannot render - too many rows (rowCount: ${rowCount}, limit: ${rowLimit}) `,
                        "General"
                    );
                    return;
                }

                /**
                 * User interaction while rows were fetched. Return early and respond to next subscribe callback.
                 */
                const allRows = await dataView.allRows();
                if (allRows == null) {
                    return;
                }

                await callback(dataView, ...args);

                mod.controls.errorOverlay.hide("General");
            } catch (e) {
                if (e instanceof Error) {
                    mod.controls.errorOverlay.show(e.message, "General");
                    console.error(e);
                }
            }
        } as T;
    };
}

function intersect(first: Rect, second: Rect) {
    if (first.x1 > second.x2 || second.x1 > first.x2) {
        return false;
    }
    if (first.y1 > second.y2 || second.y1 > first.y2) {
        return false;
    }
    return true;
}

function contrastColor(hexCode: string): string {
    let L = getLuminance(hexCode);

    if ((L + 0.05) / (0.0 + 0.05) > (1.0 + 0.05) / (L + 0.05)) {
        return "#000000";
    } else {
        return "#ffffff";
    }
}
