'use strict';

import * as fs from 'fs';
import * as path from 'path';

import GLSLCode from './GLSLCode';
import GLSLCompiler from './GLSLCompiler';
import HLSLCompiler, { HLSLCompileResult } from './HLSLCompiler';
import ShaderDocument from './ShaderDocument';


export default class HLSLtoGLSLRecompiler {

    public hlsl: HLSLCompiler = new HLSLCompiler();
    public glsl: GLSLCompiler = new GLSLCompiler();

    public canUseNativeBinaries(): Promise<boolean>
    {
        return this.hlsl.canUseNativeBinary().then(
            (value: Boolean) => value ? this.glsl.canUseNativeBinary() : false
        );
    }

    public GetIncludeDirectories(shaderDocument: ShaderDocument): string[]
    {
        let dirname = path.dirname(shaderDocument.fileName);

        return this.hlsl.includeDirs.map((dir: string) =>
        {
            if (dir === '.')
            {
                return dirname;
            }

            if (dir.startsWith('./'))
            {
                return dirname + dir.substr(1);
            }

            if (dir.startsWith('../'))
            {
                return dirname + '/' + dir;
            }

            return dir;
        });
    }

    public loadConfiguration()
    {
        this.glsl.loadConfiguration();
        this.hlsl.loadConfiguration();
    }

    public PreprocessHLSL(shaderDocument: ShaderDocument): Promise<HLSLCompileResult>
    {
        return this.hlsl.CompilePreprocess(shaderDocument);
    }

    public async HLSL2GLSL(shaderDocument: ShaderDocument): Promise<GLSLCode>
    {
        shaderDocument.lastCompiledCode = await shaderDocument.getPreprocessedCode();
        shaderDocument.lastCompiledIfdefs = await shaderDocument.getEnabledIfdefs();

        let res = await this.hlsl.CompileToSPIRV(shaderDocument);

        if (!res.filename)
        {
            throw new Error("no SPIRV file generated");
        }

        let glslCode:GLSLCode = await this.glsl.Process(shaderDocument, res.filename);

        fs.unlink(res.filename, () => {});

        return glslCode;
    }
}
