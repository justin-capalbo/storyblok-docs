const watch = require('node-watch')
const concat = require('json-concat')
const frontmatter = require('front-matter')

const { resolve } = require('path')
const { readdir, stat } = require('fs').promises
const { mkdirSync, readFile, writeFile, mkdir, unlink } = require('fs')

const marked = require('marked')
const prism = require('prismjs')
const loadCodeLanguages = require('prismjs/components/')
const markedOptions = {
  highlight: function (code, lang) {
    loadCodeLanguages([lang])
		return prism.highlight(code, prism.languages[lang], lang)
	}
}

marked.setOptions(markedOptions)

// Configuration
const config = require('../docgen.config.js')
const contents = {}

const Docgen = {
  init: () => {
    mkdirSync(config.parsedContentDir, { recursive: true })
    Docgen.generateAllDirectory()
    watch(config.originContentDir, { recursive: true }, Docgen.fileEvent)
  },

  fileEvent: (evt, updatedFile) => {
    if (evt == 'remove') {
      unlink(Docgen.getOutputFilePath(updatedFile), (err) => {
        if (err) throw err
      })
    } else {
      Docgen.generate(updatedFile)
    }
  },

  updateCollections: (source) => {
    for (let index = 0, max = config.ignoreFiles.length; index < max; index++) {
      if (source.indexOf(config.ignoreFiles[index]) >= 0) {
        return
      }
    }
    
    readFile(source, { encoding: 'utf8' }, (err, data) => {
      let path = Docgen.getRelativeFilePath(source)
     
      contents[path] = JSON.parse(data)
  
      let ordered = Object.values(contents).sort((a, b) => {
        if (a.attributes.position < b.attributes.position) return -1
        if (a.attributes.position > b.attributes.position) return 1
        return 0
      })
  
      writeFile(config.combinedContentFile, JSON.stringify(contents), (err) => {
        if (err) throw err
      })
  
      let menu = []
      let latestStartpage = null
  
      for (let index = 0, max = ordered.length; index < max; index++) {
        const element = JSON.parse(JSON.stringify(ordered[index]));
        delete element.example
        delete element.content
        delete element.origin
        if (latestStartpage == null) {
          latestStartpage = element
          latestStartpage.children = []
        } else if (typeof element.attributes !== 'undefined' && element.attributes.startpage) {
          menu.push(latestStartpage)
          latestStartpage = element
          latestStartpage.children = []
        } else {
          latestStartpage.children.push(element)
        }
        if (index + 1 >= max) {
          menu.push(latestStartpage)
        }
      }
  
      writeFile(config.menuContentFile, JSON.stringify(menu, null, 2), (err) => {
        if (err) throw err
      })
  
      writeFile(config.orderedContentFile, JSON.stringify(ordered, null, 2), (err) => {
        if (err) throw err
      })
    })
  },

  generateAllDirectory: () => {
    (async () => {
      for await (const f of Docgen.getFilesFromDirectory(config.originContentDir)) {
        Docgen.generate(f)
      }
    })()
  },
  
  getFilesFromDirectory: async function* (dir) {
    const subdirs = await readdir(dir)
    for (const subdir of subdirs) {
      const res = resolve(dir, subdir)
      if ((await stat(res)).isDirectory()) {
        yield* Docgen.getFilesFromDirectory(res)
      } else {
        yield res
      }
    }
  },

  getDirectoryPath(file) {
    return file.substring(0, file.lastIndexOf('/')).replace(config.baseDir, config.docgenDir)
  },

  getOutputFilePath(file) {
    return file.replace(config.baseDir, config.docgenDir).replace('.md', '.json')
  },

  getRelativeFilePath(file) {
    return '/' + file.replace(config.originContentDir, '').replace('.md', '').replace(config.parsedContentDir, '').replace('.json', '')
  },

  stripParagraphWrapper(markdown) { 
    return markdown.replace('<p>', '').replace('</p>\n', '')
  },

  generate: (source) => {
    readFile(source, { encoding: 'utf8' }, (err, originData) => {
      if (err) throw err
  
      let dir = Docgen.getDirectoryPath(source)
      mkdir(dir, { recursive: true }, (err) => {
  
        let originContent = frontmatter(originData)
        let originDataBody = originContent.body
        let originDataAttributes = originContent.attributes
        
        let area = originDataBody.split(config.splitString)
  
        let content = marked(area[0] || '')
        let example = marked(area[1] || '')
        
        let path = Docgen.getRelativeFilePath(source)
  
        let data = {
          path: path,
          attributes: originDataAttributes,
          content: content,
          example: example
        }
  
        if (typeof originDataAttributes.title !== 'undefined') {
          data.title = Docgen.stripParagraphWrapper(marked(originDataAttributes.title))
        }
        
        let out = Docgen.getOutputFilePath(source)
        writeFile(out, JSON.stringify(data), (err) => {
          if (err) throw err
          Docgen.updateCollections(out)
        })
      })
    })
  }
}

Docgen.init()