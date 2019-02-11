import * as vscode from 'vscode';

import { ShaderType } from './Enums';
import { GLSLCode } from './GLSLCompiler';

import * as Utils from './Utils';


export default class ShaderDocument
{
    private context: vscode.ExtensionContext;

	public document: vscode.TextDocument;
	public shaderType: ShaderType;
	public entryPointName: string = "main";
	public documentId: number;

    public lastCompiledVersion: number | undefined = undefined;

	public lastUpdateVersion: number | undefined = undefined;
    public isBeingUpdated: boolean = false;

    public glslCode: GLSLCode | undefined = undefined;

	private _needsUpdate: boolean = true;

	public set needsUpdate(value: boolean)
	{
		this._needsUpdate = value;
	}

	public get needsUpdate(): boolean
	{
		return this._needsUpdate || ((this.version !== this.lastUpdateVersion) && (this.lastCompiledVersion !== this.version));
	}

	public get text(): string
	{
		return this.document.getText();
	}

	public get version(): number
	{
		return this.document.version;
	}

	public get uri(): vscode.Uri
	{
		return this.document.uri;
	}

	public get fileName(): string
	{
		return this.document.fileName;
    }

    private _ifdefs: string[] = [];
    private _ifdefs_update_version: number | undefined = undefined;

    public get ifdefs(): string[]
    {
        if (this.version !== this._ifdefs_update_version)
        {
            this._ifdefs = Utils.GetIfdefs(this.text);
            this._ifdefs_update_version = this.version;
        }

        return this._ifdefs;
    }

    private get uniformsSettingsKey(): string
    {
        return 'uniforms_' + this.document.uri.toString();
    }

    public get uniforms(): object
    {
        console.log('get uniforms', this.context.workspaceState.get(this.uniformsSettingsKey));
		return this.context.workspaceState.get(this.uniformsSettingsKey, {});
    }

    public set uniforms(value: object)
    {
        console.log('set uniforms', value);
        this.context.workspaceState.update(this.uniformsSettingsKey, value);
    }

    private get enabledIfdefsSettingsKey(): string
    {
        return 'ifdefs_' + this.uri.toString();
    }

    private get enabledIfdefsVersionSettingsKey(): string
    {
        return 'ifdefs_version_' + this.uri.toString();
    }

    public get enabledIfdefs(): string[]
    {
        let key = this.enabledIfdefsSettingsKey;

        let versionKey = this.enabledIfdefsVersionSettingsKey;

        if (this.version === this.context.workspaceState.get<number>(versionKey))
        {
            return this.context.workspaceState.get<string[]>(key) || [];
        }
        else
        {
            let savedIfdefs = this.context.workspaceState.get<string[]>(key);

            if (savedIfdefs)
            {
                return savedIfdefs.filter(
                    (savedIfdef: string): boolean =>
                    {
                        return this.ifdefs.indexOf(savedIfdef) >= 0;
                    }
                );
            }
            else
            {
                return [];
            }
        }
    }

    public set enabledIfdefs(newEnabledIfdefs: string[])
    {
        if (this.enabledIfdefs.length !== newEnabledIfdefs.length)
        {
            this.needsUpdate = true;
        }
        else
        {
            this.enabledIfdefs.forEach(oldEnabledIfdef =>
            {
                if (newEnabledIfdefs.indexOf(oldEnabledIfdef) < 0)
                {
                    this.needsUpdate = true;
                }
            });

            if (!this.needsUpdate)
            {
                newEnabledIfdefs.forEach(newEnabledIfdef =>
                {
                    if (this.enabledIfdefs.indexOf(newEnabledIfdef) < 0)
                    {
                        this.needsUpdate = true;
                    }
                });
            }
        }

        this.context.workspaceState.update(
            this.enabledIfdefsSettingsKey,
            newEnabledIfdefs.filter(
                (newIfdef: string): boolean =>
                {
                    return this.ifdefs.indexOf(newIfdef) >= 0;
                }
            )
        );

        this.context.workspaceState.update(
            this.enabledIfdefsVersionSettingsKey,
            this.version
        );
    }

    public code: string | undefined = undefined;

    public reflection: { [key:string]: any } = {};

    public get textures(): { [key:string]: string }
	{
		let result: { [key:string]: string } = {};

        if ('separate_images' in this.reflection)
        {
            this.reflection['separate_images'].forEach(
                (tex: { [key:string]: any }) =>
                {
                    result[tex['name']] = tex['type'];
                }
            );
		}

		return result;
	}

	constructor(context: vscode.ExtensionContext, documentId:number, document: vscode.TextDocument, shaderType: ShaderType = ShaderType.pixel, lastUpdateVersion: number | undefined = undefined)
	{
        this.context = context;
		this.documentId = documentId;
		this.document = document;
		this.shaderType = shaderType;
		this.lastUpdateVersion = lastUpdateVersion;
	}
}
