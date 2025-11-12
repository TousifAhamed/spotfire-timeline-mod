# Timeline Mod for Spotfire® - Enhanced Edition

<img src="assets/timeline.png" width="60%"/>

Display a list of events in chronological order to communicate time-related information, over time, either for analysis or to visually present a story or view of history.

> **Forked from**: [spotfiresoftware/spotfire-mod-timeline](https://github.com/spotfiresoftware/spotfire-mod-timeline)  
> This enhanced version includes advanced zoom capabilities, automatic time aggregation, and improved user experience.

## ✨ Enhanced Features

This enhanced version includes professional-grade improvements:

### 🔍 Advanced Zoom Functionality
- **Mouse Wheel Zoom**: Hold `Ctrl` (or `Cmd` on Mac) and scroll to zoom in/out on the timeline
- **Smooth Zoom Range**: 20% to 1000% with fluid transitions
- **Focus Point Preservation**: Zoom maintains your viewing position for intuitive navigation
- **Visual Zoom Indicator**: Real-time display of current zoom level and aggregation view

### 📊 Automatic Time Aggregation
The timeline intelligently adjusts time granularity based on zoom level:
- **Zoom < 30%**: Yearly View - High-level overview
- **Zoom 30-60%**: Quarterly View - Medium-term trends
- **Zoom 60-100%**: Monthly View - Detailed timeline
- **Zoom > 100%**: Daily View - Maximum detail with all hierarchy levels

### 🎨 User Experience Improvements
- **Single Scrollbar**: Clean interface with no duplicate scroll bars
- **On-screen Instructions**: Helpful zoom guide displayed at bottom (auto-hides after first use)
- **Card Hover Effects**: Smooth visual feedback on interactive elements
- **Custom Scrollbar**: Styled scrollbar for better aesthetics
- **Optimized Performance**: Debounced rendering (30ms) for smooth zoom transitions

### 🛠️ Technical Enhancements
- Fixed scroll handling to use proper container element
- Improved zoom algorithms with better focus point calculation
- Gesture prevention for trackpad pinch-to-zoom conflicts
- Enhanced error handling and render cycle management

## Installation & Use

[Download latest version](https://github.com/spotfiresoftware/spotfire-mod-timeline/releases)

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

## About Mods for Spotfire®
-   [Spotfire Community Exchange](https://community.spotfire.com/files/): A safe and trusted place to discover ready-to-use Mods
-   [Developer documentation](https://spotfiresoftware.github.io/spotfire-mods/docs/): Introduction and tutorials for Mods developers
-   [Mods examples](https://github.com/TIBCOSoftware/spotfire-mods/): A public repository for examples projects

## License

Copyright (c) 2023 Cloud Software Group, Inc. All Rights Reserved.

This software is licensed under the BSD-3-Clause License. See [LICENSE.md](LICENSE.md) for full details.

### Third-Party Licenses

This project includes the following open-source libraries:

- **D3.js** (v7.3.0) - ISC License
- **Polished** (v4.1.4) - MIT License

See [LICENSE.md](LICENSE.md) for complete third-party license information.
