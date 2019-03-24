export class SyntaxTreeNode
{
    public type: string;
    public line: number;
    public column: number;
    public data: string;
    public children: SyntaxTreeNode[] = [];

    constructor(type: string, line: number, column: number, data: string)
    {
        this.type = type;
        this.line = line;
        this.column = column;
        this.data = data;
    }

    addChild(node: SyntaxTreeNode)
    {
        this.children.push(node);
    }

    getChildrenOfType(type: string, recursive: boolean = false, maxDepth:number = -1)
    {
        if (!recursive)
        {
            return this.children.filter(ch => ch.type === type);
        }

        let queue: { node: SyntaxTreeNode, depth: number }[] = [];
        this.children.forEach(ch => queue.push({ node: ch, depth: 0 }));

        for(let i = 0; i < queue.length; ++i)
        {
            let item = queue[i];
            if (maxDepth !== -1 && item.depth >= maxDepth)
            {
                continue;
            }
            item.node.children.forEach(ch => queue.push({ node: ch, depth: item.depth + 1 }));
        }

        return queue.map(item => item.node).filter(ch => ch.type === type);
    }
}

export default class SyntaxTreeParser
{
    static ResolveLineNumber(stack: SyntaxTreeNode[]): number
    {
        for(let i = stack.length - 1; i >= 0; --i)
        {
            return stack[i].line;
        }

        return 0;
    }

    static processNode(tree: SyntaxTreeNode, stack: SyntaxTreeNode[], desc: string, depth: number)
    {
        while(stack.length > depth + 1)
        {
            stack.pop();
        }

        let parts = desc.split(/\s+/);
        let NodeType = parts.shift();

        if (!NodeType)
        {
            console.error('invalid AST line:', desc);
            return;
        }

        parts.shift(); // skipping some hex value

        let bracketDepth = 0;
        let dataToParse = parts.join(' ');

        let location = '';

        let line: number | undefined = undefined;
        let column: number | undefined = undefined;
        let data: string = '';

        for(let j = 0; j < dataToParse.length; ++j)
        {
            let char = dataToParse[j]
            if (char === '<')
            {
                bracketDepth += 1;
            }
            else if (char === '>')
            {
                bracketDepth -= 1;
                if (bracketDepth === 0)
                {
                    location = dataToParse.substr(1, j - 1);
                    data = dataToParse.substr(j + 1);
                    break;
                }
            }
        }

        let locParts = location.split(/,\s*/);
        for(let i = 0; i < locParts.length; ++i)
        {
            let locPartsParts = locParts[i].split(':');
            switch(locPartsParts[0])
            {
                case 'col':
                    column = parseInt(locPartsParts[1]);
                break;
                case 'line':
                    line = parseInt(locPartsParts[1]);
                    column = parseInt(locPartsParts[2]);
                break;
                default:
                    // should be a filename
                    line = parseInt(locPartsParts[1]);
                    column = parseInt(locPartsParts[2]);
                break;
            }
        }

        if (typeof(line) === 'undefined')
        {
            line = SyntaxTreeParser.ResolveLineNumber(stack);
        }

        if (typeof(column) === 'undefined')
        {
            throw new Error('failed to resolve column number: ' + desc);
        }

        let node = new SyntaxTreeNode(NodeType, line, column, data);
        stack[stack.length - 1].addChild(node);
        stack.push(node);
    }

    static processLine(tree: SyntaxTreeNode, stack: SyntaxTreeNode[], line: string)
    {
        for(let i = 0; i < line.length; ++i)
        {
            let char = line[i];

            switch(char)
            {
                case '`':
                    // subscope
                break;
                case '|':
                    // scope line
                break;
                case '-':
                    // statement / expression / declaration
                break;
                case ' ':
                break;
                default:
                    return SyntaxTreeParser.processNode(tree, stack, line.substr(i), (i + 1) / 2);
            }
        }
    }

    public static Parse(data: string): SyntaxTreeNode
    {
        let tree = new SyntaxTreeNode('ROOT', 0, 0, '');

        let stack: SyntaxTreeNode[] = [ tree ];

        let lines = data.split(/\n/);
        for(let i = 0; i < lines.length; ++i)
        {
            let line = lines[i];
            if (!line.trim()) { continue; }

            SyntaxTreeParser.processLine(tree, stack, line);
        }

        return tree;
    }

    static parseFunctionReturnType(spec: string)
    {
        return spec.split('(')[0].trim();
    }

    static parsePramType(spec: string)
    {
        let str = spec.split(':')[0];
        return str.substr(1, str.length - 2);
    }

    static getFunctions(tree: SyntaxTreeNode)
    {
        return tree.getChildrenOfType('FunctionDecl', true, 1)
        .map(decl =>
        {
            const re_func = /line:(\d+):(\d+)\s+(?:(used)\s+)?(\w+)\s+'([^']+)'/g;
            let func = re_func.exec(decl.data.trim());

            if (!func)
            {
                // function calls are FunctionDecls too, but they have <invalid sloc> data
                if (!decl.data.trim().startsWith('<invalid sloc>'))
                {
                    console.error('failed to parse FunctionDecl:', decl.data.trim());
                }
                return null;
            }

            let paramDecls = decl.getChildrenOfType('ParmVarDecl');

            let args: ({ name: string, used: boolean, type: string}|null|undefined)[] = paramDecls.map(paramDecl =>
            {
                const re_param = /col:(\d+)\s+(?:(used)\s+)?(\w+)\s+('.*')(?:\s+(.*))?/g;
                let param = re_param.exec(paramDecl.data);

                if (param === null) { return null; }

                return {
                    name: param[3],
                    used: param[2] === 'used',
                    type: SyntaxTreeParser.parsePramType(param[4])
                };
            });

            return {
                name: func[4],
                args: args,
                used: func[3] === 'used',
                returnType: SyntaxTreeParser.parseFunctionReturnType(func[5])
            };
        }).filter(o => o !== null);
    }
}
