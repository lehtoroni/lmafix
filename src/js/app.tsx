import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Fixer } from './fixer';
import { RemixIcon } from 'src/js/util';

export function App() {
    
    const [file, setFile] = useState<File | null>(null);
    const [fixerKey, setFixerKey] = useState<number>(0);
    
    return <main className='main'>
        
        <header className='info'>
            <h1>📁 lmafix</h1>
            <p>
                This tool will attempt to fix a broken <a href="https://lehtodigital.fi/lmath/">L'Math .lma file</a> for you.
                Disclaimer: It does not always succeed.
                If you have an important file and the tool does not work, please <a href="https://lehtodigital.fi/lmath/contact/">contact me</a>.
            </p>
        </header>
        
        <div className='fixer-wrapper'>
            
            {file
                ? <Fixer
                    key={fixerKey}
                    file={file}
                    reset={() => {
                        setFile(null);
                        setFixerKey(k => k+1);
                    }}
                    />
                : <div className='fix-file-drop'
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault();
                        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            console.log(e.dataTransfer.files);
                            setFile(e.dataTransfer.files[0]);
                        }
                    }}
                    onClick={e => {
                        e.preventDefault();
                        const inp = document.createElement('input');
                        inp.type = 'file';
                        inp.accept = '.lma';
                        inp.addEventListener('change', e => {
                            if (inp.files && inp.files.length > 0) {
                                setFile(inp.files[0]);
                            }
                        });
                        inp.style.display = 'none';
                        document.body.appendChild(inp);
                        inp.click();
                    }}
                    >
                    <h2><RemixIcon icon='ri-download-2-fill'/></h2>
                    <p>Drop a file or Click to choose...</p>
                </div>}
            
        </div>
        
        <footer className='footer'>
            <div>
                &copy; Roni Lehto 2026 &middot; <a href="https://lehtodigital.fi/lmath/">L'Math</a> &middot; <a href="https://github.com/lehtoroni/lmafix4" target='_blank'>Source on Github</a>
            </div>
            <div>
                This tool works in your browser. No data will be sent to the server.
            </div>
        </footer>
        
        
    </main>;
    
}