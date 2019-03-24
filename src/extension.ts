import * as vscode from 'vscode';

import HLSLPreview from './HLSLPreview';


export function activate(context: vscode.ExtensionContext)
{
	let preview = new HLSLPreview(context);

	vscode.commands.registerCommand(
		'hlsl.preview.start',
		preview.onStartCommand.bind(preview)
	);

	vscode.commands.registerCommand(
		'hlsl.preview.codegenue4',
		preview.onPreprocessCommand.bind(preview)
	);

	vscode.commands.registerCommand(
		'hlsl.preview.codegenue4select',
		preview.onPreprocessSelectCommand.bind(preview)
	);
}

export function deactivate()
{

}
