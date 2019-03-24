
import * as fs from 'fs';
import * as path from 'path';

class CachedFile
{
    public filename: string;
    public time: Date;
    public data: string;

    constructor(filename: string, data: string, time: Date = new Date())
    {
        this.filename = filename;
        this.time = time;
        this.data = data;
    }
}

export default class CachingFileReader
{
    static cache: { [key:string]: CachedFile } = {};

    static async readFile(filename: string): Promise<string>
    {
        filename = path.normalize(filename);

        if (filename in CachingFileReader.cache)
        {
            let mtime = await CachingFileReader.getModificationTime(filename);

            if (mtime < CachingFileReader.cache[filename].time)
            {
                return CachingFileReader.cache[filename].data;
            }
            else
            {
                let readTime = new Date();
                let data = await CachingFileReader.readFileFromFilesystem(filename);
                CachingFileReader.cache[filename].data = data;
                if (readTime > CachingFileReader.cache[filename].time)
                {
                    CachingFileReader.cache[filename].time = readTime;
                }
                return data;
            }
        }
        else
        {
            let readTime = new Date();
            let data = await CachingFileReader.readFileFromFilesystem(filename);
            CachingFileReader.cache[filename] = new CachedFile(filename, data, readTime);
            return data;
        }
    }

    static async getModificationTime(filename: string): Promise<Date>
    {
        return new Promise<Date>((resolve, reject) =>
        {
            fs.stat(filename, (err: NodeJS.ErrnoException, stats: fs.Stats): void =>
            {
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve(stats.mtime);
                }
            });
        });
    }

    static async readFileFromFilesystem(filename: string): Promise<string>
    {
        return new Promise<string>((resolve, reject) =>
        {
            fs.readFile(filename, { encoding: 'utf8' },
            (err: NodeJS.ErrnoException, data: string): void =>
            {
                if (err)
                {
                    reject(err);
                }
                else
                {
                    resolve(data);
                }
            });

        });
    }

    static async fileExists(filename: string): Promise<boolean>
    {
        return new Promise((resolve, reject) => {
            fs.exists(filename, resolve);
        });
    }
}