HLSL preview for VSCode
=======

Real time preview for HLSL shaders.

### Videos
* https://www.youtube.com/watch?v=Q6EBV7tTz0U
* https://www.youtube.com/watch?v=uhZ2Nz8ISp4


## Features
* DirectX 11 HLSL syntax pixel and vertex shaders live preview
* Automatic parameters (uniform variables) detection via reflection
* Configurable entry points
* Compiler error reporting
* Mesh preview

## Usage
To open the preview select `Preview HLSL` in editor tab context menu or in command pallete.

To create a custom shader parameter declare a global variable or use `// INPUTS(type): name` comment and it will automatically appear in preview settings window as soon as the shader compiles.

#### Automatically updated parameters:
##### Vertex shader
* `float4x4 modelMatrix`
* `float4x4 modelViewMatrix`
* `float4x4 projectionMatrix`
* `float4x4 viewMatrix`
* `float3x3 normalMatrix`
* `float3 cameraPosition`
##### Fragment shader
* `float iTime` - seconds since preview started
* `float2 iResolution` - viewport size in pixels
* `float4 iMouse`
    * `iMouse.xy` - cursor relative location in viewport
    * `iMouse.z` - seconds **left** mouse button held down or **< 0.0**
    * `iMouse.w` - seconds **right** mouse button held down or **< 0.0**
* Virtual camera matrices available in 2D preview mode:
    * `iVirtualProjectionMatrix`
    * `iVirtualProjectionInverseMatrix`
    * `iVirtualModelViewMatrix`
    * `iVirtualWorldMatrix`
    * `iVirtualWorldInverseMatrix`

## Limitations
* `uint`s are not supported.
* bitwise operations are limited.
* Textures can not always be used as function parameters.

## Optional compiler binaries

### The extensions includes WebAssembly versions of compilers and does not require external binaries to work. Using external binaries greatly improves preview startup time and eliminates loading screen.
Installation:
* DirectX Compiler
    1. Compile or download a build of DirectX Shader Compiler:
    https://github.com/Microsoft/DirectXShaderCompiler.
    1. Add `dxc` executable to `PATH` or set `hlsl.preview.dxc.executablePath`.
    1. Add your shader include directories to `hlsl.preview.dxc.includeDirs`. (Optional)

* SPIRV-Cross
    1. Compile or download a build of SPIRV-Cross:
https://github.com/KhronosGroup/SPIRV-Cross.
    1. Add `SPIRV-Cross` executable to `PATH` or set `hlsl.preview.spirv.executablePath`.

* Set `hlsl.preview.useNativeBinaries` to `true`.