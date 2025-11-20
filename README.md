# Timeline Mod for Spotfire® - Enhanced Edition

<img src="assets/timeline.png" width="60%"/>

Display a list of events in chronological order to communicate time-related information, over time, either for analysis or to visually present a story or view of history.

> **Forked from**: [spotfiresoftware/spotfire-mod-timeline](https://github.com/spotfiresoftware/spotfire-mod-timeline)  
> This enhanced version includes advanced zoom capabilities, automatic time aggregation, and improved user experience. Maintained by [TousifAhamed](https://github.com/TousifAhamed).

## ✨ Enhanced Features

This enhanced version includes professional-grade improvements for handling **huge datasets** with superior performance:

### ⚡ Hyper Scale Architecture for Massive Datasets

**Massive Scale Support**:
- **1,000,000 Time Segments**: Increased from 50,000 to 1,000,000 (20x improvement)
- **1,000,000 Row Limit**: Handle datasets up to 1,000,000 rows efficiently
- **Viewport-Based Rendering**: Only renders cards visible in current view + buffer zone
- **Automatic Performance Mode**: Activates intelligent optimizations above 5,000 cards

**Smart Rendering Engine**:
- **Binary Search Culling**: O(log N) visibility checks for instant rendering of 1M items
- **Strided Loop Rendering**: Mathematically skips invisible timeline nodes
- **Dynamic Buffering**: 2x viewport width buffer prevents pop-in during scroll
- **RequestAnimationFrame**: Smooth 60fps scrolling even with massive datasets
- **Intelligent Data Filtering**: Filters cards before D3 rendering for maximum efficiency

**Real-Time Performance Monitoring**:
When working with large datasets (> 5,000 cards), an optional performance overlay (enable by appending `?debugPerf=1` to the mod URL during development) displays:
- Total Cards in dataset
- Currently Rendered Cards
- Culling Efficiency (% reduction)
- Render Time (color-coded: green < 50ms, yellow < 100ms, red > 100ms)
- Current Performance Mode
- Current Zoom Level

### 🔍 Advanced Zoom Functionality
- **Mouse Wheel Zoom**: Hold `Ctrl` (or `Cmd` on Mac) and scroll to zoom in/out on the timeline
- **Extended Zoom Range**: 20% to 1000% with fluid transitions (50x range)
- **Focus Point Preservation**: Zoom maintains your viewing position for intuitive navigation
- **Visual Zoom Indicator**: Real-time display of current zoom level and aggregation view
- **Smooth Debouncing**: 30ms debounce prevents rendering stutters during continuous zoom

### 📊 Automatic Time Aggregation
The timeline intelligently adjusts time granularity based on zoom level:
- **Zoom < 30%**: Yearly View - High-level overview (Level 0)
- **Zoom 30-60%**: Quarterly View - Medium-term trends (Levels 0-1)
- **Zoom 60-100%**: Monthly View - Detailed timeline (Levels 0-2)
- **Zoom > 100%**: Daily/Detailed View - Maximum detail with all hierarchy levels

This automatic aggregation reduces visual clutter and improves performance when zoomed out.

### 🎨 User Experience Improvements
- **Single Scrollbar**: Clean interface with no duplicate scroll bars
- **On-screen Instructions**: Helpful zoom guide displayed at bottom (auto-hides after first use)
- **Card Hover Effects**: Smooth visual feedback on interactive elements (scale 1.02)
- **Custom Scrollbar**: Styled 12px scrollbar for better aesthetics
- **Error Messages**: Helpful guidance when dataset exceeds limits

### 🛠️ Technical Enhancements
- **Viewport Bounds Calculation**: Efficient tracking of visible area boundaries
- **Optimized D3 Data Joins**: Only updates visible elements in DOM
- **Fixed Scroll Handling**: Uses proper container element for accurate positioning
- **Gesture Prevention**: Prevents trackpad pinch-to-zoom conflicts
- **Enhanced Error Handling**: Clear messages with actionable recommendations
- **Memory Optimization**: Stores all cards in memory but only renders visible subset

## Installation & Use

[Download latest version](https://github.com/TousifAhamed/spotfire-timeline-mod/releases)

The [Wiki](https://github.com/spotfiresoftware/spotfire-mod-timeline/wiki) contains step-by-step instruction on how to install and use this Mod in Spotfire®.

## Building the Project

In a terminal window:
- `npm install`
- `npm run build-watch`

In a new terminal window:
- `npm run server`

### Building for production

The development version of bundle.js is uncompressed and not suitable for end-users. Run the following command to compress the bundle:
- `npm run build`

## 🎯 How to Use Zoom

1. **Zoom In/Out**: Hold `Ctrl` (or `Cmd` on Mac) + Scroll mouse wheel
   - Scroll **up** = Zoom in (expand timeline)
   - Scroll **down** = Zoom out (compress timeline)
2. **Normal Scrolling**: Use mouse wheel without `Ctrl` for horizontal scrolling
3. **View Indicator**: Check top-right corner for current zoom level and time aggregation
4. **Performance Stats**: For large datasets (> 5,000 cards), stats appear in top-left corner

## 📈 Performance Characteristics

### Dataset Size Recommendations

| Dataset Size | Performance Mode | Expected Behavior | Render Time |
|-------------|------------------|-------------------|-------------|
| < 1,000 cards | Normal | All cards rendered | < 20ms |
| 1,000 - 5,000 cards | Normal | All cards rendered | 20-50ms |
| 5,000 - 100,000 cards | **High-Performance** | Viewport culling active | 30-70ms |
| 100,000 - 1,000,000 cards | **Hyper Scale** | Binary Search + Strided Loop | 50-100ms |

### Performance Mode Features

**Normal Mode** (< 5,000 cards):
- All cards rendered at once
- Maximum visual fidelity
- Suitable for most use cases

**High-Performance Mode** (≥ 5,000 cards):
- Automatic activation
- Viewport-based rendering
- Real-time performance stats overlay
- Dynamic scroll updates with requestAnimationFrame
- Typical reduction: 90-95% fewer DOM nodes
- Smooth 60fps scrolling maintained

### Optimization Tips

1. **Filter Your Data**: Use Spotfire filters to reduce time segments before visualization
2. **Aggregate Time Axis**: Group by weeks/months instead of days for better overview
3. **Zoom Out**: Use lower zoom levels for overview, zoom in for details
4. **Use Hierarchy**: Properly structured time hierarchies enable auto-aggregation
5. **Monitor Performance**: Check top-left overlay to see culling efficiency

### Maximum Limits

- **Max Time Segments**: 1,000,000
- **Max Rows**: 1,000,000
- **Recommended for Smooth Performance**: < 500,000 cards
- **Viewport Buffer**: 2x screen width (automatically adjusted)

## About Mods for Spotfire®
-   [Spotfire Community Exchange](https://community.spotfire.com/files/): A safe and trusted place to discover ready-to-use Mods
-   [Developer documentation](https://spotfiresoftware.github.io/spotfire-mods/docs/): Introduction and tutorials for Mods developers
-   [Mods examples](https://github.com/TIBCOSoftware/spotfire-mods/): A public repository for examples projects

## License

Copyright (c) 2025 Tousif Ahamed. All Rights Reserved.

This software is licensed under the BSD-3-Clause License. See [LICENSE.md](LICENSE.md) for full details.

### Third-Party Licenses

This project includes the following open-source libraries:

- **D3.js** (v7.3.0) - ISC License
- **Polished** (v4.1.4) - MIT License

See [LICENSE.md](LICENSE.md) for complete third-party license information.
