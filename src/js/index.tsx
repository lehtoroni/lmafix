import { h, render } from 'preact';
import { App } from './app';

const base = document.querySelector('#base');
if (!base) throw new Error(`No base?!`);

render(<App/>, base);
