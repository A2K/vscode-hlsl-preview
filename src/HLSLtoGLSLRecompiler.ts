'use strict';

import * as fs from 'fs';

import GLSLCompiler, { GLSLCode } from './GLSLCompiler';
import HLSLCompiler from './HLSLCompiler';
import ShaderDocument from './ShaderDocument';


export default class HLSLtoGLSLRecompiler {

    private hlsl: HLSLCompiler = new HLSLCompiler();
    private glsl: GLSLCompiler = new GLSLCompiler();

    public HLSL2GLSL(shaderDocument: ShaderDocument): Promise<GLSLCode>
    {
        return new Promise<GLSLCode>((resolve, reject) =>
        {
            if (shaderDocument.code && !shaderDocument.needsUpdate && !shaderDocument.isBeingUpdated)
            {
                resolve(shaderDocument.glslCode);
                return;
            }

            this.hlsl.CompileToSPIRV(shaderDocument).then(
                (filename) =>
                {
                    if (!filename)
                    {
                        reject("no SPIRV file generated");
                        return;
                    }

                    this.glsl.Process(shaderDocument, filename)
                    .catch(reject)
                    .then(
                        (glslCode) =>
                        {
                            fs.unlink(filename, () => {});

                            if (glslCode)
                            {
                                resolve(glslCode);
                            }
                            else
                            {
                                reject("no GLSL code generated");
                            }
                        }
                    );
                }
            ).catch(
                (reason) =>
                {
                    reject(reason);
                }
            );
        });
    }
}
