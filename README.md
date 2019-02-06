HLSL preview for VSCode
=======

## Video: https://www.youtube.com/watch?v=Q6EBV7tTz0U

## Features
* Updates in real time
* Configurable entry point
* DirectX 11 syntax support
* Compiler error reporting
* Mesh preview
* Includes easy to use GUI for setting up variables

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


## Limitations
SPIRV-Cross limitations:
* `uint`s are not supported.
* bitwise operations on signed `int`s are not supported.
