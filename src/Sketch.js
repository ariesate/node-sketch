const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const Layer = require('./Layer');
const Artboard = require('./Artboard');
const Page = require('./Page');

class Sketch {

    // Read a .sketch file and return an instance of Sketch
    static read(file) {
        return JSZip.loadAsync(fs.readFileSync(file))
            .then(async (zip) => {
                const document = await zip.file('document.json').async('string');
                const meta = await zip.file('meta.json').async('string');
                const user = await zip.file('user.json').async('string');

                return {
                    repo: zip,
                    document: JSON.parse(document),
                    meta: JSON.parse(meta),
                    user: JSON.parse(user)
                };
            })
            .then(async (data) => {
                data.pages = [];

                return Promise.all(
                    data.document.pages.map(async (page) => {
                        const contents = await data.repo.file(`${page._ref}.json`).async('string');
                        return JSON.parse(contents);
                    })
                )
                .then((pages) => {
                    data.pages = pages;
                    return data;
                });
            })
            .then((data) => {
                return new Sketch(
                    data.repo,
                    data.document,
                    data.meta,
                    data.user,
                    data.pages
                );
            });
    }

    constructor(repo, document, meta, user, pages) {
        this.layerCache = {};

        this.repo = repo;
        this.document = document;
        this.meta = meta;
        this.user = user;
        this.pages = pages.map((page) => this.getLayerInstance(page));
    }

    getLayerInstance (data) {
        if (!(data.do_objectID in this.layerCache)) {
            this.layerCache[data.do_objectID] = createInstance(this, data);
        }

        return this.layerCache[data.do_objectID];
    }

    //Save document as sketch file
    save(file) {
        const pagesFolder = this.repo.folder('pages');

        this.document.pages = this.pages.map((page) => {
            this.repo.file(`pages/${page.id}.json`, page.toString());

            return {
                _class: 'MSJSONFileReference',
                _ref_class: 'MSImmutablePage',
                _ref: `pages/${page.id}`
            };
        });

        this.repo.file('document.json', JSON.stringify(this.document));
        this.repo.file('meta.json', JSON.stringify(this.meta));
        this.repo.file('user.json', JSON.stringify(this.user));

        return new Promise((resolve, reject) => {
            this.repo.generateNodeStream({
                type: 'nodebuffer',
                streamFiles: true
            })
            .pipe(fs.createWriteStream(file))
            .on('finish', () => {
                resolve(file);
            })
            .on('error', (err) => {
                reject(err);
            });
        });
    }
}

module.exports = Sketch;

function createInstance(sketch, data) {
    switch (data._class) {
        case Page.type:
            return new Page(sketch, data);

        case Artboard.type:
            return new Artboard(sketch, data);

        default:
            return new Layer(sketch, data);
    }
}