import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';


const CHECK_FILES_EXIST = true;
const LOAD_MINIFIED_JS = false;


/*
function isJavaScriptFile(filename: string): boolean
{
	return filename.toLowerCase().endsWith('.js');
}

function isJavaScriptFilePath(filePath: string[]): boolean
{
	if (!filePath.length)
	{
		return false;
	}

	return filePath[filePath.length - 1].toLowerCase().endsWith('.js');
}
*/

function isMinifiedFilename(filename: string): boolean
{
	return filename.toLocaleLowerCase().endsWith('.min.js');
}

function getMinifiedFilename(filename: string): string
{
	if (isMinifiedFilename(filename))
	{
		return filename;
	}

	let parts = filename.split('.');
	parts.pop();
	parts.push('min');
	parts.push('js');
	return parts.join('.');
}

function fileExists(filename: string): boolean
{
	return fs.existsSync(filename);
}

export function GetMediaPath(context: vscode.ExtensionContext, mediaFilePath: string[]): vscode.Uri
{
	let mediaFile = path.join.apply(path, mediaFilePath);

	let mediaPath = context.asAbsolutePath(path.join('media', mediaFile));

	if (CHECK_FILES_EXIST)
	{
		if (!fs.existsSync(mediaPath))
		{
			console.warn("GetLibraryPath: requested file does not exist:", mediaPath);
		}
	}

	return vscode.Uri.file(mediaPath).with({ scheme: 'vscode-resource' });
}

/*
function getMinifiedFilenameIfExists(absFilePath: string): string
{
	let minified = getMinifiedFilename(absFilePath);

	if (fileExists(minified))
	{
		return minified;
	}

	return absFilePath;
}
*/

export function GetScriptPath(context: vscode.ExtensionContext, scriptPath: string[]): vscode.Uri
{
	let filenameWithExtension:string = scriptPath[scriptPath.length - 1] + '.js';

	scriptPath.splice(scriptPath.length - 1, 1, filenameWithExtension);

	let compiledPath = ['out', 'WebView'].concat(scriptPath);

	let filename = context.asAbsolutePath(path.join.apply(path, compiledPath));

	if (CHECK_FILES_EXIST)
	{
		if (fileExists(filename))
		{
			return vscode.Uri.file(filename).with({ scheme: 'vscode-resource' });
		}
		else
		{
			scriptPath.unshift('scripts');
			scriptPath.unshift('media');
			filename = context.asAbsolutePath(path.join.apply(path, scriptPath));
			return vscode.Uri.file(filename).with({ scheme: 'vscode-resource' });
		}
	}
	else
	{
		return vscode.Uri.file(filename).with({ scheme: 'vscode-resource' });
	}
}

export function GetLibraryPath(context: vscode.ExtensionContext, scriptPath: string[]): vscode.Uri
{
	let filenameWithExtension:string = scriptPath[scriptPath.length - 1] + '.js';

	scriptPath.splice(scriptPath.length - 1, 1, filenameWithExtension);

	let scriptName = path.join.apply(path, scriptPath);

	let libraryPath = context.asAbsolutePath(path.join('media', 'scripts', 'libs', scriptName));

	if (CHECK_FILES_EXIST)
	{
		let pathExists = fs.existsSync(libraryPath);
		if (!pathExists || LOAD_MINIFIED_JS)
		{
			let minified = getMinifiedFilename(libraryPath);
			if (fileExists(minified))
			{
				pathExists = true;
				libraryPath = minified;
			}
			else
			{
				if (pathExists && !LOAD_MINIFIED_JS)
				{
					console.warn("GetLibraryPath: minified version of this file does not exist:", libraryPath);
				} else if (!pathExists)
				{
					console.error("GetLibraryPath: file does not exist:", libraryPath);
				}
			}
		}
	}
	else
	{
		if (LOAD_MINIFIED_JS)
		{
			libraryPath = getMinifiedFilename(libraryPath);
		}
	}

	return vscode.Uri.file(libraryPath).with({ scheme: 'vscode-resource' });
}

function makeScriptTag(src: string|vscode.Uri): string
{
	return `<script src="${src}" language="javascript"></script>`;
}

function getWASMIncludes(context: vscode.ExtensionContext, useBinaryDXC: boolean, useWASMWebServer: boolean, wasmWebServerPort: number): string
{
	let files = [ 'spirv.js', 'dxcompiler.js', 'wasmcompiler.js' ];

	if (useBinaryDXC)
	{
		return '<script language="javascript">WASMCompiler = false</script>';
	}

	if (useWASMWebServer)
	{
		const getUrl = (file: string) => `http://127.0.0.1:${wasmWebServerPort}/wasm/${file}`;

		return files.map(file => makeScriptTag(getUrl(file))).join('\n');
	}
	else
	{
		return files.map(file => makeScriptTag(GetMediaPath(context, [ 'wasm', file ]))).join('\n');
	}
}

function ResolveMultiplePaths(array: any[]): any[]
{
	const recurse = (array: any[], prefix: any[] = []): any[] =>
	{
		prefix = prefix || [];

		if (!array.length)
		{
			return prefix;
		}

		return ((array[0] instanceof Array) ? array[0] : [array[0]])
		.reduce((result:any, value:any) =>
		{
			let next = prefix.concat((value instanceof Array) ? value : [value]);

			let item = recurse(array.slice(1), next);

			if ((item instanceof Array) && (item[0] instanceof Array))
			{
				result = result.concat(item);
			}
			else
			{
				result.push(item);
			}

			return result;
		}, []);
	};

	return recurse(array);
}

function GetDefaultFragmentShader(): string
{
	// TODO: add support for SV_Position

	// return `void main() { gl_FragColor = vec4(0.0); }`;
	return `
	struct type_Globals
	{
		highp vec2 iResolution;
	};

	uniform type_Globals _Globals;

	varying highp vec2 var_TEXCOORD0;

	void main()
	{
		const vec3 iGridColor1 = vec3(0.2);
		const vec3 iGridColor2 = vec3(0.3);

		vec4 Grid = vec4(0.0, 0.0, 0.0, 1.0);
        bvec2 t = lessThan(mod(var_TEXCOORD0 * _Globals.iResolution / vec2(10.0), vec2(2.0)), vec2(1.0));
		Grid.rgb = ((t.x ^^ t.y) ? iGridColor1 : iGridColor2);
        gl_FragColor = Grid;
	}
	`;
}

function GetDefaultTextureFragmentShader(): string
{
	return `
	struct type_Globals
	{
		highp vec2 iResolution;
		highp vec2 iBufferResolution;
		highp vec2 iOffset;

		highp float iTime;
		highp float iZoomTarget;
		highp float iZoom;
		highp float iZoomAnimStartTime;
		highp float iZoomAnimDuration;

		highp vec3 iGridColor1;
		highp vec3 iGridColor2;
	};

	uniform type_Globals _Globals;
	uniform highp sampler2D texture;

	varying highp vec2 var_TEXCOORD0;

	void main()
	{
		float ZoomAnimProgress = clamp((_Globals.iTime - _Globals.iZoomAnimStartTime) / max(1.0, _Globals.iZoomAnimDuration), 0.0, 1.0);
		float Zoom = mix(_Globals.iZoom, _Globals.iZoomTarget, ZoomAnimProgress);

		vec2 uv = (var_TEXCOORD0 * 2.0 - vec2(1.0));

		uv = uv * _Globals.iZoom + _Globals.iOffset * 2.0;

		uv = (uv + vec2(1.0)) * 0.5;


		float coef = max(Zoom * 2.0 + 1.0, 1.0);

		bvec2 t = lessThan(mod(uv * _Globals.iResolution / vec2(5.0), vec2(2.0 * floor(coef))), vec2(1.0 * floor(coef)));
		vec4 Grid = vec4(0.0, 0.0, 0.0, 1.0);
		Grid.rgb = ((t.x ^^ t.y) ? _Globals.iGridColor1 : _Globals.iGridColor2);

		uv = (uv * 2.0 - vec2(1.0));

		uv = uv *
			vec2(_Globals.iResolution.x / _Globals.iResolution.y,
				_Globals.iBufferResolution.x / _Globals.iBufferResolution.y);

		uv = (uv + vec2(1.0)) * 0.5;

		if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))))
		{
			gl_FragColor = Grid;
			return;
		}

		vec4 Color = clamp(texture2D(texture, uv), vec4(0.0), vec4(1.0));
		gl_FragColor = mix(Grid, Color, Color.a);
	}
	`;
}

export function GetWebviewContent(context: vscode.ExtensionContext, useBinaryDXC: boolean, useWASMWebServer: boolean, wasmWebServerPort: number): string
{
	const makeTag =
		(F: (context: vscode.ExtensionContext, scriptPath: string[]) => vscode.Uri) =>
			(...path: any[]) =>
				ResolveMultiplePaths(path).map(p =>
					`<script src="${F(context, p)}" language="javascript"></script>`
				).join('\n');

	const SCRIPT = makeTag(GetScriptPath);

	const LIB = makeTag(GetLibraryPath);

	const PATH = (...path: string[]) => GetMediaPath(context, path);

	return `
	<!DOCTYPE html>
	<html lang="en">
	<html>
		<head>
			<meta charset="UTF-8">
			<title>HLSL preview</title>

			<link rel="stylesheet" type="text/css" href="${ PATH('css', 'main.css') }"></link>

			<script language="javascript">var exports = window;</script>

			${ LIB('jquery') }
			${ LIB('Sortable') }
			${ LIB('jquery-sortable') }
			${ LIB('three', 'three') }
			${ LIB('three', 'controls', 'OrbitControls') }
			${ LIB('three', 'loaders', [ 'DDSLoader', 'TGALoader', 'FBXLoader' ]) }
			${ LIB('base64') }

			${ getWASMIncludes(context, useBinaryDXC, useWASMWebServer, wasmWebServerPort) }

			${ SCRIPT('log') }

		</head>
		<img id="defaultTexture" src="${ PATH('images', 'uvgrid.jpg') }" hidden="hidden"></img>
		<script id="fragmentShader" type="x-shader/x-fragment">
			${ GetDefaultFragmentShader() }
		</script>
		<script id="textureFragmentShader" type="x-shader/x-fragment">
			${ GetDefaultTextureFragmentShader() }
		</script>
		<script id="bufferPreviewFragmentShader" type="x-shader/x-fragment">
			varying highp vec2 var_TEXCOORD0;
			uniform sampler2D buffer;
			void main()	{
				gl_FragColor = texture2D(buffer, var_TEXCOORD0);
			}
		</script>
		<script id="vertexShader" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = vec2(uv.x, 1.0 - uv.y);
				gl_Position = vec4( position, 1.0 );
			}
		</script>
		<script id="vertexShaderInvY" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = vec2(uv.x, uv.y);
				gl_Position = vec4( position, 1.0 );
			}
		</script>
		<script id="vertexShaderMesh" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		</script>

		<script id="skyboxPath" type="x-skybox-path/x-path">${ PATH('images', 'skybox') }/</script>

		<body>

			<div id="contentWrapper">
				<div id="content"></div>
			</div>

			<div id="errorFrame"></div>

			${ SCRIPT(['Constants']) }

			${ SCRIPT(['WebUtils']) }

			${ SCRIPT(['MouseListener']) }

			${ SCRIPT(['ZoomControls']) }

			${ SCRIPT(['Clipboard']) }
			${ SCRIPT(['Events', 'FileOpener', 'Communicator', 'MessageProcessor']) }

			${ SCRIPT(['Renderable']) }

			${ SCRIPT(['AbstractView']) }
			${ SCRIPT(['AbstractWindow']) }

			${ SCRIPT(['ScrollView']) }
			${ SCRIPT(['CheckboxView']) }
			${ SCRIPT(['LabelView']) }
			${ SCRIPT(['TableView', 'TableRowView', 'TableCellView']) }
			${ SCRIPT(['GroupView']) }
			${ SCRIPT(['ContextMenu']) }

			${ SCRIPT(['WindowManager']) }

			${ SCRIPT(['HeaderWindow']) }

			${ SCRIPT('shader', ['Shader', 'PixelShader', 'VertexShader', 'ShaderBuffer']) }

			${ SCRIPT(['ShaderReactor', 'SettingsWindow', 'BuffersRenderer', 'BuffersListView']) }
			${ SCRIPT(['ShaderSettingsView', 'ShaderSettingsWindow', 'TextureSettingsWindow' ]) }
			${ SCRIPT(['ShaderUniforms', 'PreviewRenderer', 'Merge' ]) }

			${ SCRIPT(['VirtualCamera']) }

			${ SCRIPT(['PreviewScene', 'PreviewScene2D', 'BufferPreviewScene2D', 'PreviewScene3D' ]) }

			${ SCRIPT(['IfdefsSettingsView', 'UniformsSettingsView', 'TexturesSettingsView' ]) }


			${ SCRIPT('main') }

		</body>
	</html>
	`;
}


