
import { Buffer } from 'buffer';
import * as fflate from 'fflate';
import * as cheerio from 'cheerio';

export type FixResult = {
    result: 'success' | 'warning' | 'error',
    warnings: string[],
    meta: FixableMeta,
    zipData?: Uint8Array
};

export type FileMeta = {
    name: string,
    fullPath: string,
    size: number
};

export type FixableMeta = {
    
    fileList: Record<string, FileMeta>,
    
    readFile: (path: string) => Promise<Uint8Array<ArrayBufferLike> | null>,
    readFileUnicode: (path: string) => Promise<string | null>,
    
    //writeFile: (path: string, content: Buffer | string) => Promise<void>,
    
    meta: Record<string, any> | null,
    pageList: string[] | null
    
};

export async function checkAndFixLMA(
    file: File,
    log: (data: string, level: 'info' | 'success' | 'warning' | 'error') => any
): Promise<FixResult> {
    
    log(`Starting to deflate "${file.name}"`, 'info');
    
    const fileData = new Uint8Array(await file.arrayBuffer());
    const fileList = await readZipStructure(fileData);
    
    log(`Archive contains ${Object.entries(fileList).length} entries`, 'info');
    console.log(fileList);
    
    let needsIndexRebuild = false;
    let needsMetaRebuild = false;
    
    let jsonMeta: Record<string, any> | null = null;
    let jsonPageList: string[] | null = null;
    
    const nonFatalWarnings: string[] = [];
    const logNonFatal = (str: string) => {
        nonFatalWarnings.push(str);
        log(str, 'warning');
    }
    
    await asyncWait(100);
    if (fileList['images/'] || Object.keys(fileList).some(filePath => filePath.startsWith('images/'))) {
        log(`Worksheet has images/ folder`, 'success');
    } else {
        logNonFatal(`Worksheet does not have images/ folder`);
    }
    
    await asyncWait(100);
    if (fileList['pages/'] || Object.keys(fileList).some(filePath => filePath.startsWith('pages/'))) {
        log(`Worksheet has pages/ folder`, 'success');
    } else {
        log(`Worksheet does not have pages/ folder`, 'error');
        throw new Error(`Fatal: Worksheet file does not have a pages/ folder`);
    }
    
    await asyncWait(100);
    if (fileList['worksheet.json']) {
        log(`Worksheet has a metadata file`, 'success');
    } else {
        needsMetaRebuild = true;
        logNonFatal(`Worksheet does not have a metadata file - needs rebuilding`);
    }
    
    await asyncWait(100);
    if (fileList['pages.json']) {
        log(`Worksheet has a page index file`, 'success');
    } else {
        needsIndexRebuild = true;
        logNonFatal(`Worksheet does not have a page index file - needs rebuilding`);
    }
    
    await asyncWait(100);
    const pageIndexRaw = await readFileFromZip(fileData, 'pages.json');
    const allPageIds: string[] = [];
    if (pageIndexRaw) {
        
        const pageIndexString = Buffer.from(pageIndexRaw).toString();
        let pageDataJson: any[] | null = null;
        
        try {
            
            pageDataJson = JSON.parse(pageIndexString);
            if (!pageDataJson || !Array.isArray(pageDataJson)) {
                pageDataJson = null;
                throw new Error(`Page index is null or not an array`);
            }
            
        } catch (err) {
            logNonFatal(`Page index is invalid, needs rebuilding: ${err}`);
            needsMetaRebuild = true;
        }
        
        if (pageDataJson) {
            
            log(`Page index is valid JSON. Cross-checking...`, 'success');
            jsonPageList = pageDataJson;
            
            const pageFiles = Object.keys(fileList).filter(fn => fn.startsWith('pages/') && fn.endsWith('.json'));
            
            if (pageDataJson.length == 0 && pageFiles.length == 0) {
                log(`Worksheet does not contain any pages, there is nothing to fix.`, 'error');
                throw new Error(`Worksheet does not contain any pages, there is nothing to fix.`);
            }
            
            // check if all pages in index exist in file list
            for (const pageId of pageDataJson) {
                if (!pageFiles.includes(`pages/${pageId}.json`)) {
                    logNonFatal(`Missing page: ${pageId}`);
                    needsIndexRebuild = true;
                }
            }
            await asyncWait(100);
            log(`Done checking index against file list`, 'info');
            
            // check if all pages are visible
            for (const pageFile of pageFiles) {
                const pageId = (pageFile.split('/').pop() || '').replace('.json', '');
                allPageIds.push(pageId);
                if (!pageDataJson.includes(pageId)) {
                    logNonFatal(`Found hidden or deleted page: ${pageId}`);
                    needsIndexRebuild = true;
                }
            }
            await asyncWait(100);
            log(`Done checking file list against index`, 'info');
            
        }
        
    } else {
        needsIndexRebuild = true;
        needsMetaRebuild = true;
    }
    
    await asyncWait(100);
    const metaDataRaw = await readFileFromZip(fileData, 'worksheet.json');
    if (metaDataRaw) {
        const metaDataString = Buffer.from(metaDataRaw).toString();
        try {
            const metaDataJson = JSON.parse(metaDataString);
            if (!metaDataJson || Object.entries(metaDataJson).length == 0) {
                throw new Error(`Metadata is null or missing entries`);
            }
            log(`Metadata is valid JSON`, 'success');
            jsonMeta = metaDataJson;
        } catch (err) {
            logNonFatal(`Metadata is invalid, needs rebuilding: ${err}`);
            needsMetaRebuild = true;
        }
    } else {
        needsMetaRebuild = true;
    }
    
    if (jsonMeta && jsonMeta.currentPageId) {
        if (!allPageIds.includes(jsonMeta.currentPageId)) {
            logNonFatal(`Current page index (${jsonMeta.currentPageId}) points to a missing page`);
            needsMetaRebuild = true;
            needsIndexRebuild = true;
        } else {
            log(`Current page index is valid`, 'success');
        }
    }
    
    const rawZipData = await new Promise<Uint8Array>((resolve, reject) => {
        
        const zipArchiveParts: Uint8Array[] = [];
        const zipOut = new fflate.Zip((err, data, final) => {
            if (err) {
                reject(err);
                return;
            }
            zipArchiveParts.push(data);
            if (final) {
                resolve(concatUint8Arrays(zipArchiveParts));
            }
        });
        
        (async () => {
            
            /*
             * Add pages
             */
            log(`Copying pages over...`, 'info');
            const pageFilesData = await readFilesFromZip(fileData, fn => fn.startsWith('pages/') && fn.endsWith('.json'));
            let pageIndexRaw = [];
            
            for (const [pagePath, pageDataRaw] of Object.entries(pageFilesData)) {
                
                const pageId = (pagePath.split('/').pop() || '').replace('.json', '');
                const pageDataString = Buffer.from(pageDataRaw).toString('utf8');
                
                let pageJsonOut: any = null;
                
                try {
                    
                    const pageJson = JSON.parse(pageDataString);
                    
                    if (!pageJson || typeof pageJson !== 'object' || !('content' in pageJson)) {
                        needsIndexRebuild = true;
                        throw new Error(`Page JSON is invalid`);
                    }
                    
                    if (!pageJson.id || pageJson.id != pageId) {
                        logNonFatal(`Page ${pagePath} id mismatch (${pageJson.id}), fixing`);
                        needsIndexRebuild = true;
                        pageJson.id = pageId;
                    }
                    
                    let pageNeedsRebuild = false;
                    let rawPageContent = pageJson.content || '';
                    
                    if (rawPageContent) {
                        
                        const $ = cheerio.load(`<div id="__root"></div>`);
                        const $page = $('<div/>').html(rawPageContent);
                        
                        const NON_ALLOWED_SELECTOR = '[data-js="mathEditor"]';
                        const foundNonAllowed = $page.find(NON_ALLOWED_SELECTOR);
                        
                        let changedDom = false;
                        
                        if (foundNonAllowed.length > 0) {
                            
                            logNonFatal(`Page ${pageId} contains non-allowed or non-saveable elements`);
                            
                            foundNonAllowed.each((i, el) => {
                                const $el = $(el);
                                log(`Removing ${el.tagName}[class="${$el.attr('class')}"][data-js="${$el.attr('data-js')}"][id="${$el.attr('id')}"]`, 'warning');
                                $el.remove();
                            })
                            
                            changedDom = true;
                            
                        }
                        
                        if (changedDom) {
                            pageNeedsRebuild = true;
                            rawPageContent = $page.html();
                        }
                        
                    }
                    
                    if (pageNeedsRebuild) {
                        log(`Rebuilding page content...`, 'info');
                        pageJson.content = rawPageContent;
                    }
                    
                    pageJsonOut = JSON.stringify(pageJson);
                    
                    
                } catch (err) {
                    needsIndexRebuild = true;
                    logNonFatal(`Page ${pagePath} is corrupted: ${err}`);
                    pageJsonOut = JSON.stringify({
                        id: pageId,
                        title: 'Corrupted page file',
                        content: ` `,
                        length: 1,
                    });
                }
                
                if (pageJsonOut) {
                    pageIndexRaw.push(pageId);
                    addRawFileToZip(zipOut, pagePath, fflate.strToU8(pageJsonOut));
                }
                
                await asyncWait(10);
                
            }
            
            
            /*
             * Add images
             */
            log(`Copying images over...`, 'info');
            //const pageFilesData = await readFilesFromZip(fileData, fn => fn.startsWith('pages/') && fn.endsWith('.json'));
            const imageFiles = await readFilesFromZip(fileData, fn => fn.startsWith('images/'));
            let n = 0;
            for (const [imagePath, imageRaw] of Object.entries(imageFiles)) {
                addRawFileToZip(zipOut, imagePath, imageRaw, 0);
                await asyncWait(2);
                n++;
            }
            log(`Added ${n} images`, 'info');
            
            
            if (needsMetaRebuild) {
                log(`Rebuilding metadata...`, 'info');
                addRawFileToZip(zipOut, 'worksheet.json', fflate.strToU8(JSON.stringify({
                    title: 'Korjattu työkirja',
                    description: '',
                    author: 'LMAFix',
                    latestVersion: 'r1.10.0',
                    created: (new Date()).toISOString(),
                    theme: 'light',
                    bookmarks: [],
                    // left here
                })));
            } else {
                log(`Copying metadata...`, 'info');
                const rawMeta = await readFileFromZip(fileData, 'worksheet.json') ?? fflate.strToU8('{}');
                addRawFileToZip(zipOut, 'worksheet.json', rawMeta);
            }
            
            if (needsIndexRebuild) {
                log(`Rebuilding page index...`, 'info');
                addRawFileToZip(zipOut, 'pages.json', fflate.strToU8(JSON.stringify([
                    ...allPageIds
                ])));
            } else {
                log(`Copying page index...`, 'info');
                const rawPageList = await readFileFromZip(fileData, 'pages.json') ?? fflate.strToU8('[]');
                addRawFileToZip(zipOut, 'pages.json', rawPageList);
            }
            
        })()
            .then(() => {
                zipOut.end();
            })
            .catch(err => reject(err))
        
    });
    
    console.log(rawZipData)
    
    let result: 'success' | 'warning' | 'error' = 'success';
    if (nonFatalWarnings.length > 0) {
        result = 'warning';
    }
    
    return {
        result,
        warnings: nonFatalWarnings,
        meta: {
            fileList,
            pageList: jsonPageList,
            meta: jsonMeta,
            readFile: path => readFileFromZip(fileData, path),
            readFileUnicode: async path => Buffer.from(await readFileFromZip(fileData, path) || '').toString('utf8')
        },
        zipData: rawZipData
    };
    
}

export function addRawFileToZip(zip: fflate.Zip, fileName: string, contents: Uint8Array, compressionLevel: number = 9) {
    const entry = new fflate.ZipDeflate(fileName, {
        level: compressionLevel as any
    });
    zip.add(entry);
    entry.push(contents, true);
}

export function asyncWait(delay: number) {
    return new Promise<void>(resolve => setTimeout(() => resolve(), delay));
}

export function concatUint8Arrays(fileData: Uint8Array[]) {
    const finalFileSize = fileData.map(b => b.length).reduce((p, c) => p+c, 0);
    const finalData = new Uint8Array(finalFileSize);
    let offset = 0;
    for (const buf of fileData) {
        for (let i = 0; i < buf.length; i++) {
            finalData[offset + i] = buf[i];
        }
        offset += buf.length;
    } 
    return finalData;
}

export function readFilesFromZip(fileData: Uint8Array, fileFilter: (fn: string) => boolean) {
    return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        
        const unzipper = new fflate.Unzip();
        unzipper.register(fflate.UnzipInflate);
        
        const filePromises: Promise<[string, Uint8Array]>[] = [];
        
        unzipper.onfile = (file) => {
            if (fileFilter(file.name)) {
                
                const fileData: Uint8Array[] = [];
                
                filePromises.push(new Promise((resolveInner, rejectInner) => {
                    
                    file.ondata = (err, data, final) => {
                    
                        if (err) {
                            rejectInner(err);
                            return;
                        }
                        
                        fileData.push(data);
                        
                        if (final) {
                            resolveInner([file.name, concatUint8Arrays(fileData)]);
                        }
                        
                    }
                    
                    file.start();
                    
                }));
                
            }
        }
        
        unzipper.push(fileData, true);
        
        Promise.allSettled(filePromises)
            .then(fulfilled => {
                resolve(Object.fromEntries(fulfilled.filter(pr => pr.status == 'fulfilled').map(pr => pr.value)));
            })
        
    });
}

export function readFileFromZip(fileData: Uint8Array, fileToRead: string) {
    return new Promise<Uint8Array | null>((resolve, reject) => {
        
        const unzipper = new fflate.Unzip();
        unzipper.register(fflate.UnzipInflate);
        
        unzipper.onfile = (file) => {
            if (file.name == fileToRead) {
                
                const fileData: Uint8Array[] = [];
                
                file.ondata = (err, data, final) => {
                    
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    fileData.push(data);
                    
                    if (final) {
                        resolve(concatUint8Arrays(fileData));
                    }
                    
                }
                
                file.start();
                
            }
        }
        
        unzipper.push(fileData, true);
        resolve(null);
        
    });
}

export function readZipStructure(fileData: Uint8Array) {
    return new Promise<Record<string, FileMeta>>((resolve, reject) => {
        
        const files: Record<string, FileMeta> = {};
        
        const unzipper = new fflate.Unzip();
        unzipper.register(fflate.UnzipInflate);
        
        unzipper.onfile = (file) => {
            files[file.name] = {
                name: file.name.split('/').pop() || '?',
                fullPath: file.name,
                size: file.size ?? 0
            }
        }
        
        unzipper.push(fileData, true);
        resolve(files);
        
    });
}
