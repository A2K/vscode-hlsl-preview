
export default class ObjectMerger
{

    public static MergeArrays(dst: any [], src: any [])
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
                        ObjectMerger.MergeObjects(existingItem, item);
                    }
                    else if (existingItem instanceof Array)
                    {
                        ObjectMerger.MergeObjects(existingItem, item);
                    }
                    else
                    {
                        console.warn('ObjectMerger: warning: duplicate item: ' + JSON.stringify(item));
                        dst[dstIndex] = item;
                    }
                }
            }
        );
    }

    public static MergeObjects(dst: { [key:string]: any }, src: { [key:string]: any })
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
                                ObjectMerger.MergeObjects(itemValue, item);
                                dst[key].push(itemValue);
                            }
                            else if (item instanceof Array)
                            {
                                let itemValue: any[] = [];
                                ObjectMerger.MergeArrays(itemValue, item);
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
                    ObjectMerger.MergeObjects(dst[key], src[key]);
                }
                else
                {
                    dst[key] = src[key];
                }
            }
        );
    }
}
