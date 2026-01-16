# 📁 lmafix
Browser-based tool for repairing broken [L'Math](https://lehtodigital.fi/lmath/) LMA files.

## How to use?
- I host the tool for anyone to use, go to https://korjaa.lehtodigital.fi/
- Or clone the repo, run `npm install && npm build` and host everything under `dist/`

## Used Technologies
Everyting happens in the browser. Files are never sent to the server. Used libraries and tools include

- Preact and Typescript
- Parcel for bundling
- `fflate`&ast; for all the deflating/inflating tasks

&ast;) 7z-wasm or similar would be nicer, but experience from LMAFix2 and testing other 7z variants it seems that not all zip files can even be opened with it...

## Developing
1. `git clone`
2. `cd lmafix4`
3. Open your favourite editor
4. `npm run dev`
5. Open browser on http://localhost:1234/ (or whichever port Parcel decided)

Happy hacking!

## So how do LMA files work then?
An incomplete specification of the LMA2 file format can be found on
#### **https://lehtodigital.fi/lmath/guide/articles/lma/**

## Background
*The* original LMAFix script was just a dirty Node.js script, which extracted a given file using 7z, rebuilt the page index based on valid pages, and zipped it all up again. It was quite useful for partly saved files left after a non-clean shutdown.

However, after so many years of updates (and bugs), a more versatile and user friendly approach is a must (also for anyone who doesn't want to contact another human being just to fix their math notes...). Thus, the OG LMAFix2 was born. Then LMAFix3, which never saw daylight.

And now, this is the v4 that will probably see daylight!

## Roadmap-ish
At the moment, the tool
- validates the LMA file:
  - checks if the file could be an LMA file (i.e. has `pages/`)
  - checks if there is an `images/` folder
  - checks if there is a metadata file `worksheet.json`
  - checks if there is a page index `pages.json`
  - checks if metadata is valid JSON
  - checks if page index is valid JSON
  - checks if all indexed pages exist, and if all existing pages are indexed
  - checks if "current page" points to an existing page
  - checks if all page IDs match to their filenames
  - checks if page content contains certain illegal elements (ie. the math editor box...)
- attempts to repair any issues:
  - rebuilds page index and/or metadata file if necessary
  - removes illegal saved elements from pages
  - copies pages & images over to a new file
  - zips everything up

TODO:
- an "advanced" mode, where you could manipulate some of the data
- handle more and more and more corrupted file cases
- add some test cases
- add CLI version? (`lmafix.ts` doesn't care about the environment)

## Contributing
If you have the urge to change or add something, create a fork and a pull request. If I don't reply within ...a few months(?), please contact me via email, and I will see if your spaghetti is worth adding to my spaghetti!

## License
This project is licensed under MIT. Feel free to do cool stuff with it!
