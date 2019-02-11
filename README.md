HLSL preview for VSCode
=======

![Screenshot](https://raw.githubusercontent.com/A2K/vscode-hlsl-preview/master/media/images/screenshot.png)

### Videos
* https://www.youtube.com/watch?v=Q6EBV7tTz0U
* https://www.youtube.com/watch?v=uhZ2Nz8ISp4


## Features
* Pixel and vertex HLSL shaders preview
* DirectX 11 syntax support
* Updates in real time
* Configurable entry point
* Compiler error reporting
* Mesh preview

## Setup

#### DirectX Compiler
1. Compile or download a build of DirectX Shader Compiler:
https://github.com/Microsoft/DirectXShaderCompiler.
1. Add `dxc` executable to `PATH` or set `hlsl.preview.dxcExecutablePath`.
1. Add your shader include directories to `hlsl.preview.dxcIncludeDirs`. (Optional)

#### SPIRV-Cross
1. Compile or download a build of SPIRV-Cross:
https://github.com/KhronosGroup/SPIRV-Cross.
1. Add `SPIRV-Cross` executable to `PATH` or set `hlsl.preview.spirvcrossExecutablePath`.

## Usage
Simply open any HLSL file and execute "Preview HLSL" command.
#### Built-in variables
These variables values will be automatically updated every frame. They still need to be declared to be used.
* `float iTime`
* `float2 iResolution`
#### Vertex shader built-in variables
* `float4x4 modelMatrix`
* `float4x4 modelViewMatrix`
* `float4x4 projectionMatrix`
* `float4x4 viewMatrix`
* `float3x3 normalMatrix`
* `float3 cameraPosition`

## Limitations
* `uint`s are not supported.
