import { DataView, DataViewRow, DataViewHierarchyNode, DataViewColorInfo } from "spotfire-api";
import { getLuminance } from "polished";
import * as d3 from "d3";

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

const DEBUG = false;

/**
 * Constants
 */
const timeAxisName = "Time",
    descriptionAxisName = "Event",
    verticalSpaceBetweenCards = 12.5,
    horizontalSpaceBetweenCards = 12.5,
    rowsPerCard = 2,
    maxTimeSegments = 2000;

/**
 * Set up drawing layers
 */
const modContainer = d3.select("#mod-container");
const drawingLayer = modContainer.append("div").attr("id", "drawingLayer");
const connectorContainer = drawingLayer.append("div").attr("id", "connectors");
const cardContainer = drawingLayer.append("div").attr("id", "cards");
const timeline = drawingLayer.append("div").attr("class", "timeline");
const markingOverlay = modContainer.append("div").attr("id", "markingOverlay").attr("class", "inactiveMarking");

let selection: Rect = { x1: 0, y1: 0, x2: 0, y2: 0 };
let zoomLevel = 1.0;
let currentDataView: DataView | null = null;
let currentWindowSize: Spotfire.Size | null = null;

window.Spotfire.initialize(async (mod) => {
    /**
     * Initialize render context - should show 'busy' cursor.
     * A necessary step for printing (another step is calling render complete)
     */
    const context = mod.getRenderContext();

    let fontSize = parseInt(context.styling.general.font.fontSize.toString()); // workaround bug in Spotfire 11.4 where fontSize returns string

    let baseCardHeight = fontSize * rowsPerCard * 1.5;
    let baseTimelineLevelHeight = fontSize * 2;
    let baseMinimumTimeSegmentWidth = fontSize * 4;
    let baseCardWidth = 3.2 * baseMinimumTimeSegmentWidth;
    let autoScroll = false;
    let autoScrollSpeed = 5;

    // configfure styling
    document.querySelector("#extra_styling")!.innerHTML = `
    .body { fill: ${context.styling.general.font.color}; font-size: ${context.styling.general.font.fontSize}px; font-weight: ${context.styling.general.font.fontWeight}; font-style: ${context.styling.general.font.fontStyle};}
    .timeMarker {border-color: ${context.styling.scales.line.stroke}} 
    .timeline {border-color: ${context.styling.scales.line.stroke}} 
    .connector {background-color: ${context.styling.scales.line.stroke}}
    `;

    const reader = mod.createReader(mod.visualization.data(), mod.windowSize());

    reader.subscribe(generalErrorHandler(mod)(onChange), (err) => {
        mod.controls.errorOverlay.show(err);
    });

    // Setup smooth mouse wheel zoom on timeline (x-axis only)
    let scrollTimeout: number | null = null;
    let indicatorTimeout: number | null = null;
    let isZooming = false;
    const containerElement = modContainer.node() as HTMLElement;
    const zoomIndicator = document.getElementById("zoom-indicator");
    
    const zoomInstructions = document.getElementById("zoom-instructions");
    let hasUsedZoom = false;
    
    function showZoomIndicator() {
        if (!zoomIndicator) return;
        
        // Hide instructions after first use
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
        
        const zoomPercent = Math.round(zoomLevel * 100);
        let aggregationLevel = "All Details";
        
        if (zoomLevel < 0.3) {
            aggregationLevel = "Yearly View";
        } else if (zoomLevel < 0.6) {
            aggregationLevel = "Quarterly View";
        } else if (zoomLevel < 1.0) {
            aggregationLevel = "Monthly View";
        } else if (zoomLevel >= 2.0) {
            aggregationLevel = "Daily View";
        }
        
        zoomIndicator.textContent = `Zoom: ${zoomPercent}% • ${aggregationLevel}`;
        zoomIndicator.classList.add("visible");
        
        if (indicatorTimeout !== null) {
            clearTimeout(indicatorTimeout);
        }
        
        indicatorTimeout = window.setTimeout(() => {
            zoomIndicator.classList.remove("visible");
            indicatorTimeout = null;
        }, 1500);
    }
    
    if (containerElement) {
        containerElement.addEventListener("wheel", (event: WheelEvent) => {
            // Check if Ctrl/Cmd is held for zoom, otherwise allow normal scroll
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                
                if (isZooming || !currentDataView || !currentWindowSize) {
                    return;
                }
                
                // Calculate zoom point relative to viewport
                const rect = containerElement.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const scrollLeft = containerElement.scrollLeft;
                const zoomPointX = scrollLeft + mouseX;
                
                // Smoother zoom with smaller steps
                const zoomDelta = event.deltaY < 0 ? 0.05 : -0.05;
                const oldZoomLevel = zoomLevel;
                zoomLevel = Math.max(0.2, Math.min(10.0, zoomLevel + zoomDelta));
                
                // Only re-render if zoom actually changed
                if (Math.abs(oldZoomLevel - zoomLevel) < 0.001) {
                    return;
                }
                
                // Show zoom indicator
                showZoomIndicator();
                
                // Clear any pending timeout
                if (scrollTimeout !== null) {
                    clearTimeout(scrollTimeout);
                }
                
                // Debounce rendering for smooth experience
                isZooming = true;
                scrollTimeout = window.setTimeout(() => {
                    render(currentDataView!, currentWindowSize!).then(() => {
                        // Maintain zoom focus point
                        const zoomRatio = zoomLevel / oldZoomLevel;
                        const newScrollLeft = zoomPointX * zoomRatio - mouseX;
                        containerElement.scrollLeft = Math.max(0, newScrollLeft);
                        
                        isZooming = false;
                        scrollTimeout = null;
                    }).catch(() => {
                        isZooming = false;
                        scrollTimeout = null;
                    });
                }, 30);
            }
        }, { passive: false });
        
        // Prevent default pinch-to-zoom on trackpad
        containerElement.addEventListener("gesturestart", (event: Event) => {
            event.preventDefault();
        }, { passive: false });
        
        containerElement.addEventListener("gesturechange", (event: Event) => {
            event.preventDefault();
        }, { passive: false });
    }

    async function onChange(dataView: DataView, windowSize: Spotfire.Size) {
        currentDataView = dataView;
        currentWindowSize = windowSize;
        await render(dataView, windowSize);
    }

    async function render(dataView: DataView, windowSize: Spotfire.Size) {
        /**
         * Get Data
         */
        const hasTime = !!(await dataView.categoricalAxis(timeAxisName));
        const hasDescription = !!(await dataView.categoricalAxis(descriptionAxisName));

        if (!hasTime) {
            drawingLayer.selectAll("*").remove();
            return;
        }

        let timeLeaves = (await (await dataView.hierarchy(timeAxisName))?.root())?.leaves() || [];

        if (timeLeaves.length > maxTimeSegments) {
            drawingLayer.selectAll("*").remove();
            return;
        }

        let timeHierarchy = await dataView.hierarchy(timeAxisName);
        let timeHierarchyDepth = timeHierarchy?.levels.length || 0;
        let hierarchyRoot = await timeHierarchy?.root();
        if (!hierarchyRoot) return;

        /**
         * Calculate Layout
         */
        // Apply zoom level to x-axis (timeline width) only
        let cardHeight = baseCardHeight;
        let timelineLevelHeight = baseTimelineLevelHeight;
        let minimumTimeSegmentWidth = baseMinimumTimeSegmentWidth;
        let cardWidth = baseCardWidth;
        let timeSegmentMargin = cardWidth / 2;
        
        let timeMarkerWidth = (windowSize.width - timeSegmentMargin * 2) / timeLeaves.length;
        timeMarkerWidth = timeMarkerWidth >= minimumTimeSegmentWidth ? timeMarkerWidth : minimumTimeSegmentWidth;
        // Apply zoom level to x-axis only
        timeMarkerWidth = timeMarkerWidth * zoomLevel;
        const timeSegmentsPerCard = Math.ceil((cardWidth + horizontalSpaceBetweenCards) / timeMarkerWidth);
        const timeLineTop = windowSize.height / 2 - (timelineLevelHeight * timeHierarchyDepth) / 2;
        const drawingAreaHeight = windowSize.height - 35;
        const drawingAreaWidth = timeLeaves.length * timeMarkerWidth + timeSegmentMargin * 2 - 10;
        const timelineWidth = timeLeaves.length * timeMarkerWidth;
        const timelineHeight = (timeHierarchyDepth + 1) * timelineLevelHeight;

        let cards: Card[] = [];
        let lastPosition = new Map();
        let maxStackedCards = 0;

        timeLeaves.forEach((node: DataViewHierarchyNode) => {
            node.rows().forEach((row: DataViewRow) => {
                if (row.categorical(descriptionAxisName).formattedValue() != "") {
                    let index = row.categorical(timeAxisName).leafIndex;
                    let vp = 0;

                    while (lastPosition.get(vp) != undefined && index - lastPosition.get(vp) < timeSegmentsPerCard) {
                        vp++;
                    }
                    lastPosition.set(vp, index);
                    maxStackedCards = vp + 1 > maxStackedCards ? vp + 1 : maxStackedCards;

                    cards.push({
                        title: "",
                        description: hasDescription ? row.categorical(descriptionAxisName).formattedValue() : "",
                        verticalPosition: vp,
                        timePosition: row.categorical(timeAxisName).leafIndex,
                        color: row.color(),
                        row: row
                    });
                }
            });
        });

        let displayCards = cards.filter((card: Card) => card.description != "");

        // Shuffle cards on top of each other to fit vertically
        let cardSpacing = cardHeight + 4 + verticalSpaceBetweenCards;
        let totalSpaceRequired =
            cardSpacing * (2 * Math.ceil(maxStackedCards / 2)) + timelineLevelHeight * timeHierarchyDepth;
        cardSpacing =
            totalSpaceRequired < windowSize.height
                ? cardSpacing
                : (windowSize.height - timelineLevelHeight * timeHierarchyDepth - (cardHeight + 4) * 2) /
                  (2 * Math.ceil(maxStackedCards / 2));

        /**
         * Update DOM
         */

        // Drawing Layer
        drawingLayer
            .style("left", `${0}`)
            .style("top", `${0}`)
            .style("height", `${drawingAreaHeight}`)
            .style("width", `${drawingAreaWidth}`)
            .on("mousedown", mouseDownHandler)
            .on("dblclick", doubleclickHandler);

        // Start/Stop automatic timeline scrolling with ctrl-key or metakey + doubleclick

        function doubleclickHandler(event: MouseEvent) {
            if (event.ctrlKey || event.metaKey) {
                if (!autoScroll) {
                    autoScroll = true;
                    scroll();
                } else {
                    autoScroll = false;
                }
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

        //  Connectors

        connectorContainer
            .selectAll<HTMLDivElement, Card>(".connector")
            .data(displayCards, (d: Card) => d.row.elementId(true))
            .join("div")
            .attr("class", "connector")
            .style("left", (d) => `${timeSegmentMargin + d.timePosition * timeMarkerWidth + timeMarkerWidth / 2}px`)
            .style("top", (d) => `${calcConnectorTop(d.verticalPosition)}px`)
            .style("height", (d) => `${calcConnectorHeight(d)}px`);

        // Cards

        cardContainer
            .selectAll<HTMLDivElement, Card>(".card")
            .data(cards, (d: Card) => d.row.elementId(true))
            .join("div")
            .attr("class", "card")
            .attr("draggable", "false")
            .classed("card-marked", (d) => d.row.isMarked())
            .on("click", (e, d) => {
                d.row.mark(e.ctrlKey || e.metaKey ? "ToggleOrAdd" : "Replace");
                e.stopPropagation();
            })
            .text((d) => `${d.description}`)
            .style("left", (d: Card) => `${calculateCardLeft(d)}px`)
            .style("top", (d: Card) => `${calculateCardTop(d.verticalPosition)}px`)
            .style("height", (d: Card) => `${cardHeight}px`)
            .style("width", (d: Card) => `${cardWidth}px`)
            .style("background-color", (d) => `${d.color.hexCode}`)
            .style("color", (d: Card) => `${contrastColor(d.color.hexCode)}`);

        // marked cards on top
        cardContainer
            .selectAll<HTMLDivElement, Card>(".card")
            .filter((d: Card) => d.row.isMarked())
            .raise();

        // Timeline

        timeline
            .style("left", (d) => timeSegmentMargin)
            .style("top", (d) => timeLineTop)
            .style("width", (d) => timeLeaves.length * timeMarkerWidth + 2)
            .style("height", (d) => timelineLevelHeight * timeHierarchyDepth + 2);

        // create a d3 hierarchy with the width of each timesegment proportional to the number of descendants
        let hierarchy: d3.HierarchyNode<DataViewHierarchyNode> = d3.hierarchy(hierarchyRoot);
        hierarchy.sum((d: DataViewHierarchyNode) => (!d?.children && 1) || 0);

        let partition = d3.partition<DataViewHierarchyNode>().size([timelineWidth, timelineHeight]).padding(0).round(false);
        let partitionedHierarchy: d3.HierarchyRectangularNode<DataViewHierarchyNode> = partition(
            hierarchy as any
        ) as d3.HierarchyRectangularNode<DataViewHierarchyNode>;

        // Automatically adjust hierarchy depth based on zoom level
        // When zoomed out, show higher-level aggregations (years, months)
        // When zoomed in, show detailed level (days, hours)
        let maxDisplayLevel = timeHierarchyDepth - 1;
        if (zoomLevel < 0.3) {
            // Very zoomed out: show only top 1 level (e.g., years)
            maxDisplayLevel = Math.min(0, timeHierarchyDepth - 1);
        } else if (zoomLevel < 0.6) {
            // Zoomed out: show top 2 levels (e.g., years, quarters)
            maxDisplayLevel = Math.min(1, timeHierarchyDepth - 1);
        } else if (zoomLevel < 1.0) {
            // Normal: show top 3 levels
            maxDisplayLevel = Math.min(2, timeHierarchyDepth - 1);
        } else {
            // Zoomed in: show all levels
            maxDisplayLevel = timeHierarchyDepth - 1;
        }

        // remove the root node and filter by display level
        let displayHierarchy = partitionedHierarchy
            .descendants()
            .filter((d: d3.HierarchyRectangularNode<DataViewHierarchyNode>) => {
                return d.parent && d.data.level <= maxDisplayLevel;
            });

        timeline
            .selectAll(".timeMarker")
            .data(displayHierarchy)
            .join("div")
            .attr("class", "timeMarker")
            .classed("timeMarker-left", (d: d3.HierarchyRectangularNode<DataViewHierarchyNode>) => d.x0 == 0)
            .classed("timeMarker-top", (d: d3.HierarchyRectangularNode<DataViewHierarchyNode>) => d.data.level == 0)
            .on("click", (e, d: d3.HierarchyRectangularNode<DataViewHierarchyNode>) => {
                d.data.mark(e.ctrlKey || e.metaKey ? "ToggleOrAdd" : "Replace");
                e.stopPropagation();
            })
            .text((d: d3.HierarchyRectangularNode<DataViewHierarchyNode>) => d.data.formattedValue())
            .style("left", (d) => d.x0)
            .style("width", (d) => d.x1 - d.x0 - 5)
            .style("top", (d) => d.y0 - timelineLevelHeight)
            .style("height", (d) => d.y1 - d.y0);

        context.signalRenderComplete();

        /**
         * Inline helper functions
         */

        function mouseDownHandler(event: MouseEvent) {
            const scrollLeft = containerElement?.scrollLeft || 0;
            const scrollTop = containerElement?.scrollTop || 0;
            selection = {
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
            selection.x2 = event.clientX + scrollLeft;
            selection.y2 = event.clientY + scrollTop;

            markingOverlay
                .attr("class", "activeMarking")
                .style("left", `${selection.x2 > selection.x1 ? selection.x1 : selection.x2}`)
                .style("top", `${selection.y2 > selection.y1 ? selection.y1 : selection.y2}`)
                .style("width", `${Math.abs(selection.x2 - selection.x1)}`)
                .style("height", `${Math.abs(selection.y2 - selection.y1)}`);
        }

        function mouseUpHandler(event: MouseEvent) {
            markingOverlay
                .style("left", `${0}`)
                .style("top", `${0}`)
                .style("width", `${0}`)
                .style("height", `${0}`)
                .attr("class", "inactiveMarking");

            let selectedCards = cardContainer.selectAll<HTMLDivElement, Card>(".card").filter((c: Card) => {
                let x1 = calculateCardLeft(c);
                let y1 = calculateCardTop(c.verticalPosition);
                let cardRect: Rect = {
                    x1: x1,
                    y1: y1,
                    x2: x1 + cardWidth,
                    y2: y1 + cardHeight
                };

                if (selection.x1 > selection.x2) {
                    [selection.x1, selection.x2] = [selection.x2, selection.x1];
                }
                if (selection.y1 > selection.y2) {
                    [selection.y1, selection.y2] = [selection.y2, selection.y1];
                }

                return intersect(cardRect, selection);
            });

            if (selectedCards.size() > 0) {
                selectedCards.each((c: Card) => {
                    c.row.mark(event.ctrlKey || event.metaKey ? "ToggleOrAdd" : "Replace");
                });
                event.stopPropagation();
            } else {
                dataView.clearMarking();
            }

            document.removeEventListener("mousemove", mouseMoveHandler);
            document.removeEventListener("mouseup", mouseUpHandler);
        }

        function calculateCardLeft(d: Card) {
            return timeSegmentMargin + d.timePosition * timeMarkerWidth - cardWidth / 2 + timeMarkerWidth / 2;
        }

        function calcConnectorHeight(d: Card) {
            let height = 0;

            let group = d.verticalPosition % 2;
            let lane = Math.floor(d.verticalPosition / 2);

            switch (group) {
                case 0:
                    height = lane * cardSpacing + verticalSpaceBetweenCards;
                    break;
                case 1:
                    height = verticalSpaceBetweenCards + lane * cardSpacing - 3;
                    break;
            }
            return height;
        }

        function calcConnectorTop(verticalPosition: number) {
            let top = timeLineTop;
            let group = verticalPosition % 2;
            let lane = Math.floor(verticalPosition / 2);

            switch (group) {
                case 0:
                    top = top - verticalSpaceBetweenCards - lane * cardSpacing;
                    break;
                case 1:
                    top = top + timelineLevelHeight * timeHierarchyDepth + 3;
                    break;
            }
            return top;
        }

        function calculateCardTop(verticalPosition: number) {
            let top = timeLineTop;
            let group = verticalPosition % 2;
            let lane = Math.floor(verticalPosition / 2);

            switch (group) {
                case 0:
                    top = top - verticalSpaceBetweenCards - lane * cardSpacing - cardHeight;
                    break;
                case 1:
                    top =
                        top + timelineLevelHeight * timeHierarchyDepth + lane * cardSpacing + verticalSpaceBetweenCards;
                    break;
            }
            return top;
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
    rowLimit = 2000
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

                    if (DEBUG) {
                        throw e;
                    }
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
