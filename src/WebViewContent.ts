import * as vscode from 'vscode';

import * as path from 'path';


export function GetMediaPath(context: vscode.ExtensionContext, mediaFile: string): vscode.Uri
{
	return vscode.Uri.file(context.asAbsolutePath(path.join('media', mediaFile))).with({ scheme: 'vscode-resource' });
}

export function GetWebviewContent(context: vscode.ExtensionContext): string
{
	return `
	<!DOCTYPE html>
	<html lang="en">
	<html>
		<head>
			<meta charset="UTF-8">
			<title>HLSL preview</title>
			<link rel="stylesheet" type="text/css" href="${GetMediaPath(context, 'css/style.css')}">
			<script src="${GetMediaPath(context, 'scripts/jquery.min.js')}" language="javascript"></script>
			<script src="${GetMediaPath(context, "scripts/three.js")}" language="javascript"></script>
			<script src="${GetMediaPath(context, "scripts/OrbitControls.js")}" language="javascript"></script>
			<script src="${GetMediaPath(context, "scripts/DDSLoader.js")}" language="javascript"></script>
			<script src="${GetMediaPath(context, "scripts/TGALoader.js")}" language="javascript"></script>
			<script src="${GetMediaPath(context, "scripts/FBXLoader.js")}" language="javascript"></script>
		</head>
		<img id="defaultTexture" src="${GetMediaPath(context, "images/uvgrid.jpg")}" hidden="hidden"></img>
		<script id="fragmentShader" type="x-shader/x-fragment">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				gl_FragColor = vec4(0.0);
			}
		</script>
		<script id="vertexShader" type="x-shader/x-vertex">
			varying highp vec2 var_TEXCOORD0;
			void main()	{
				var_TEXCOORD0 = uv;
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
		<script id="skyboxPath" type="x-skybox-path/x-path">${GetMediaPath(context, "images/skybox")}/</script>

		<body>
			<div id="content"></div>
			<div id="errorFrame"></div>
			<script src="${GetMediaPath(context, "scripts/main.js")}" language="javascript"></script>
		</body>
	</html>
	`;
}
