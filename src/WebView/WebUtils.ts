
export function ArraysEqual<T>(a: T[], b: T[])
{
	let sa = new Set(a);
	let sb = new Set(b);

	if (sa.size !== sb.size)
	{
		return false;
	}

	let result = true;

	sa.forEach(item => {
		if (!sb.has(item))
		{
			result = false;
		}
	});

	return result;
}

export function MergeArrays(dst: any [], src: any [])
{
	src.forEach(
		(item: any) =>
		{
			let dstIndex = dst.indexOf(item);
			if (dstIndex < 0)
			{
				dst.push(item);
			}
			else
			{
				let existingItem = dst[dstIndex];
				if (existingItem instanceof Object)
				{
					MergeObjects(existingItem, item);
				}
				else if (existingItem instanceof Array)
				{
					MergeObjects(existingItem, item);
				}
				else
				{
					console.warn('MergeArrays: warning: duplicate item: ' + JSON.stringify(item));
					dst[dstIndex] = item;
				}
			}
		}
	);
}

export function MergeObjects(dst: { [key:string]: any }, src: { [key:string]: any })
{
	Object.keys(src).forEach(
		(key: string) =>
		{
			let value:any = src[key];
			if (value instanceof Array)
			{
				if (!(dst[key] instanceof Array) || !dst[key].length)
				{
					dst[key] = [];
				}
				value.forEach(
					(item: any) =>
					{
						if (item instanceof Object)
						{
							let itemValue = {};
							MergeObjects(itemValue, item);
							dst[key].push(itemValue);
						}
						else if (item instanceof Array)
						{
							let itemValue: any[] = [];
							MergeArrays(itemValue, item);
							dst[key].push(itemValue);
						}
						else
						{
							dst[key].push(item);
						}
					}
				);
			}
			else if (value instanceof Object)
			{
				if (!(dst[key] instanceof Object))
				{
					dst[key] = {};
				}
				MergeObjects(dst[key], src[key]);
			}
			else
			{
				dst[key] = src[key];
			}
		}
	);
}

// An array without duplicates
class ArraySet<T>
{
	private data: T[][] = [];

	add(item: T[]): boolean
	{
		if (this.data.find(i => ArraysEqual(i, item)))
		{
			return false;
		}

		this.data.push(item);

		return true;
	}

	has(item: T[]): boolean
	{
		return this.data.findIndex(i => ArraysEqual(i, item)) >= 0;
	}

	forEach(cb: (item: T[]) => any)
	{
		this.data.forEach(cb);
		return this;
	}
};

export function GetObjectProperties(item: object)
{
	return Object.keys(item).filter((key: string) =>
	{
		return !(key in ['object', 'length']);
	});
}

export function GetKeysRecursive(obj: { [key: string]: any }, maxDepth: number = 0): ArraySet<string>
{
	let paths = new ArraySet<string>();

	class QueueItem
	{
		public object: any;
		public path: string[];

		constructor(object: any, path: string[])
		{
			this.object = object;
			this.path = path;
		}
	}

	let queue: QueueItem[] = GetObjectProperties(obj).map(key => new QueueItem(obj[key], [key]));

	while(queue.length)
	{
		let item: QueueItem | undefined = queue.shift();

		if (!item ||
			(maxDepth > 0 && item.path.length > maxDepth) ||
			!paths.add(item.path))
		{
			continue;
		}

		GetObjectProperties(item.object).forEach((key: string) => {
			if (item) {
				queue.push(new QueueItem(item.object[key], item.path.concat([key])));
			}
		});
	}

	return paths;
}
