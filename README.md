HLSL preview for VSCode
=======

## Setup

#### DirectX Compiler
1. Compile or download a build of DirectX Shader Compiler:
https://github.com/Microsoft/DirectXShaderCompiler.
1. Add `dxc` executable to `PATH` or set `hlsl.preview.dxcExecutablePath`.
1. Add your shader include directories to `hlsl.preview.dxcIncludeDirs`. (Optional)

#### SPIRV-Cross
1. Compile or download a build of SPIRV-Cross:
https://github.com/KhronosGroup/SPIRV-Cross.
1. Add `SPIRV-Cross` executable to `PATH`.
1. Add `SPIRV-Cross` executable to `PATH` or set `hlsl.preview.spirvcrossExecutablePath`.

## Usage
Simply open an HLSL file and execute "Preview HLSL" command.

## Limitations
* `uint` are not supported
* bitwise operations are not supported
