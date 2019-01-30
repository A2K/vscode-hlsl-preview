HLSL preview for VSCode
=======

## Setup

#### DirectX Compiler
1. Compile or download a build of DirectX Shader Compiler:
https://github.com/Microsoft/DirectXShaderCompiler
2. Add `dxc` executable to `PATH` or set `hlsl.linter.executablePath`.
3. Add your shader include directories to `hlsl.linter.includeDirs` (Optional)

#### SPIRV-Cross
1. Compile or download a build of SPIRV-Cross:
https://github.com/KhronosGroup/SPIRV-Cross
2. Add `SPIRV-Cross` executable to `PATH`

## Usage
Simply open an HLSL file and execute "Preview HLSL" command.
