# Change Log

## 0.9.2
* Improved #inlude statements support
* Added buffers
    * Added buffer preview mode with mouse drag and zoom
    * Buffers can be used just list textures
* Added mode geometries to 3D preview mode
* Improved user interface

## 0.8.2

* Added Emscripten WebAssemblies for DirectXCompiler and SPIRV-Cross.
    * Loading `wasm` files takes a few seconds, so external binaries are preferred.
    * The extension will still use external binaries if they are available and will fall back to WebAssembly if they are not.
* Added `Render to file` button to preview settings window.
* Added copy and paste context menus with UE4 compatible serialization.
* Some configuration options have been renamed, please update your settings.
