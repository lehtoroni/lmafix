import { Fragment, h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { checkAndFixLMA, FileMeta, FixResult } from './lmafix';

import download from 'downloadjs';
import { RemixIcon } from 'src/js/util';

let fixerRunning = false;

const LOG_LINE_ICON: Record<string, string> = {
    'info': 'ri-info-i',
    'success': 'ri-check-line',
    'warning': 'ri-alert-line',
    'error': 'ri-alarm-warning-line'
};

export function Fixer(props: { file: File, reset: () => any }) {
    
    const [meta, setMeta] = useState<FileMeta | null>(null);
    
    const [logLines, setLogLines] = useState<["info" | "success" | "warning" | "error", string][]>([]);
    
    const [fixerError, setFixerError] = useState<string | null>(null);
    const [fixerResult, setFixerResult] = useState<FixResult | null>(null);
    
    useEffect(() => {
        
        if (!props.file) return;
        
        if (fixerRunning) return;
        fixerRunning = true;
        
        checkAndFixLMA(props.file, (data, level) => {
            setLogLines(l => [[level, data], ...l]);
            console.log(`[${level}] ${data}`);
        })
            .then(res => {
                setFixerResult(res);
                console.log(`fixer done`);
            })
            .catch(err => {
                console.error(`fixer failed:`);
                console.error(err);
                setFixerError(`${err}`);
                setFixerResult(null);
            })
            .finally(() => {
                fixerRunning = false;
            })
        
    }, [props.file]);
    
    return <div className='fixer'>
        
        <p style={{ margin: '0 0 16px 0' }}>
            <RemixIcon icon='ri-file-2-line'/>
            {' '}{props.file.name}
            
            {!fixerResult && !fixerError && <span className='spinner' style={{ marginLeft: '24px' }}></span>}
        </p>
        
        <div id='log'>
            {logLines.map(([level, logLine], i) => <div className='line' data-level={level}>
                <RemixIcon icon={LOG_LINE_ICON[level]}/> {logLine}
            </div>)}
        </div>
        
        {fixerError && <Fragment>
            
            <p>
                <span className='color-error'><RemixIcon icon='ri-alarm-warning-line'/> Fatal errors occurred. Either the file is not an actual L'Math file, or it cannot be fixed.</span>
            </p>
            
            <div className='error-alert'>{fixerError}</div>
            
        </Fragment>}
        
        {fixerResult && <Fragment>
            <p>
                The tool has finished.
            </p>
            <p>
                {fixerResult.result == 'success' && <span className='color-success'><RemixIcon icon='ri-check-line'/> File was re-built successfully.</span>}
                {fixerResult.result == 'warning' && <span className='color-warning'><RemixIcon icon='ri-alert-line'/> Some issues found. Fixed file is available.</span>}
                {fixerResult.result == 'error' && <span className='color-error'><RemixIcon icon='ri-alarm-warning-line'/> Fatal errors occurred. The file cannot be fixed.</span>}
            </p>
            
            {fixerResult.warnings && fixerResult.warnings.length > 0 && <Fragment>
                <details>
                    <summary>Click to view warnings</summary>
                    {fixerResult.warnings.map((w, i) =>
                        <p className='color-error' key={i}>{w}</p>
                    )}
                </details>
            </Fragment>}
            
            <hr/>
            
            {fixerResult.zipData && <Fragment>
                <p>Download your fixed file here: </p>
                <button className='btn'
                    onClick={e => {
                        e.preventDefault();
                        if (fixerResult.zipData) {
                            download(fixerResult.zipData, `${(props.file.name || 'worksheet').replace('.lma', '')}_fix_${Date.now()}.lma`, 'application/zip');
                        } else {
                            alert(`Nothing to download! :(`);
                        }
                    }}><RemixIcon icon='ri-save-3-fill'/> Save fixed file</button>
                {' '}
                <button className='btn secondary'
                    onClick={e => {
                        e.preventDefault();
                        props.reset();
                    }}><RemixIcon icon='ri-arrow-go-back-fill'/> Fix another</button>
            </Fragment>}
        </Fragment>}
        
    </div>;
    
}