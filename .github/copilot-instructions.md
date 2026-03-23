<!-- Use this file to provide workspace-specific custom instructions to Copilot. -->

# Grenoble Transport Stop Viewer - React + Tailwind + Apple Maps Project

## Project Overview
React.js web application displaying Grenoble public transport stops (MTAG API) with:
- **Interactive Apple Maps** (MapKit JS)
- **Animated sidebar overlay** - slides in from left when stop is selected
- **Full-screen map** - sidebar displays over the map, not beside it
- **Real-time departure information**
- **Design inspired by MBTA/transit UI patterns**
- **Font**: Helvetica/system fonts
- **Tailwind CSS styling**

## Architecture
- Map occupies entire screen (z-index: 0)
- Header overlays top-left (z-index: 30)
- Sidebar overlays left side when open (z-index: 40)
- Mobile overlay backdrop (z-index: 20 on mobile)

## Key Implementation Details

### Apple Maps
- Uses MapKit JS SDK loaded via CDN
- Requires personal token from Apple Developer Account
- Fallback UI shown during development without token
- See `APPLE_MAPS_SETUP.md` for configuration

### Sidebar Overlay
- Positioned `fixed` to viewport
- Slides in from left with Framer Motion
- Shows on top of full-screen map
- Touch-friendly close button
- Real-time departure countdown

### Stop Markers
- Yellow markers (bus/tram stops)
- Blue marker for selected stop
- Click to open sidebar with details

## Setup Checklist

- [x] Project Scaffolded with Vite + React
- [x] Core Dependencies Installed
- [x] Apple Maps Integration
- [x] Sidebar Overlay Implementation
- [x] Development Server Running
- [x] Documentation Complete

## Key Dependencies
- React 18
- Tailwind CSS
- Framer Motion (animations)
- Axios (API calls)
- MapKit JS (Apple Maps)

## Development Notes
- API base: https://data.mobilites-m.fr/donnees
- Currently using mock data (see src/services/api.ts)
- Real-time updates for departure times
- Mobile-first design with overlay strategy
