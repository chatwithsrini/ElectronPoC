# Electron Hello World Application

A simple Electron application that displays "Hello World".

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

To run the application, use:
```bash
npm start
```

Or:
```bash
npm run dev
```

## Project Structure

- `main.js` - Main Electron process file that creates the application window
- `index.html` - The HTML file displayed in the window
- `package.json` - Project configuration and dependencies

## Building for Distribution

**Windows installer (with custom app icon):**

1. **Option A – Run as Administrator (recommended):**  
   Right‑click **`build-win-admin.cmd`** → **Run as administrator**.  
   This builds the installer and embeds `build\installer.ico` in the app .exe.

2. **Option B – Developer Mode (no admin):**  
   Enable **Developer Mode**: Windows **Settings** → **Privacy & security** → **For developers** → **Developer Mode**.  
   Then in a normal terminal:
   ```bash
   npm run dist:win
   ```

Output: `release\DentalXChange Electron-POC-1.0.0-Setup.exe`

If you run `npm run dist:win` in a normal (non‑elevated) terminal and Developer Mode is off, the build may fail with “Cannot create symbolic link”. Use Option A or B above to fix it.

Other tools: [electron-builder](https://www.electron.build/), [electron-packager](https://github.com/electron/electron-packager)

