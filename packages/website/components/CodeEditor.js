import React, { useEffect, useState, useRef } from 'react'
import { css } from 'firebolt'

export function CodeEditor({ value, onChange, onSave }) {
  const containerRef = useRef()
  const [editor, setEditor] = useState(null)
  useEffect(() => {
    let dead
    load().then(monaco => {
      if (dead) return
      const container = containerRef.current
      const editor = monaco.editor.create(container, {
        value,
        language: 'javascript',
        scrollBeyondLastLine: true,
        lineNumbers: 'on',
        minimap: {
          enabled: false,
        },
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
      })
      editor.onDidChangeModelContent(event => {
        onChange(editor.getValue())
      })
      editor.addAction({
        id: 'save',
        label: 'Save',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: onSave,
      })
      setEditor(editor)
    })
    return () => {
      dead = true
    }
  }, [])
  return (
    <div
      className='code'
      css={css`
        flex: 1;
        .code-container {
          position: absolute;
          inset: 0;
        }
      `}
    >
      {!editor && <div>Loading...</div>}
      <div className='code-container' ref={containerRef} />
    </div>
  )
}

let promise
const load = () => {
  if (promise) return promise
  promise = new Promise(async resolve => {
    // init require
    window.require = {
      paths: {
        vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.49.0/min/vs',
      },
    }
    // load loader
    await new Promise(resolve => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.49.0/min/vs/loader.js' // prettier-ignore
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
    // load editor
    await new Promise(resolve => {
      window.require(['vs/editor/editor.main'], () => {
        resolve()
      })
    })
    monaco.editor.defineTheme('default', darkPlusTheme)
    monaco.editor.setTheme('default')
    resolve(window.monaco)
  })
  return promise
}

// see https://stackoverflow.com/questions/65921179/vs-code-theme-dark-plus-css-for-monaco-editor
// see https://github.com/ChristopherHButler/vscode-themes-in-monaco
// see https://vsctim.vercel.app/
const darkPlusTheme = {
  inherit: true,
  base: 'vs-dark',
  rules: [
    {
      foreground: '#DCDCAA',
      token: 'entity.name.function',
    },
    {
      foreground: '#DCDCAA',
      token: 'support.function',
    },
    {
      foreground: '#DCDCAA',
      token: 'support.constant.handlebars',
    },
    {
      foreground: '#DCDCAA',
      token: 'source.powershell variable.other.member',
    },
    {
      foreground: '#DCDCAA',
      token: 'entity.name.operator.custom-literal',
    },
    {
      foreground: '#4EC9B0',
      token: 'meta.return-type',
    },
    {
      foreground: '#4EC9B0',
      token: 'support.class',
    },
    {
      foreground: '#4EC9B0',
      token: 'support.type',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.name.type',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.name.namespace',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.other.attribute',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.name.scope-resolution',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.name.class',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.numeric.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.byte.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.boolean.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.string.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.uintptr.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.error.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.rune.go',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.cs',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.generic.cs',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.modifier.cs',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.variable.cs',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.annotation.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.generic.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.object.array.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.primitive.array.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.primitive.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.token.java',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.annotation.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.parameters.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.generic.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.object.array.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.primitive.array.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'storage.type.primitive.groovy',
    },
    {
      foreground: '#4EC9B0',
      token: 'meta.type.cast.expr',
    },
    {
      foreground: '#4EC9B0',
      token: 'meta.type.new.expr',
    },
    {
      foreground: '#4EC9B0',
      token: 'support.constant.math',
    },
    {
      foreground: '#4EC9B0',
      token: 'support.constant.dom',
    },
    {
      foreground: '#4EC9B0',
      token: 'support.constant.json',
    },
    {
      foreground: '#4EC9B0',
      token: 'entity.other.inherited-class',
    },
    {
      foreground: '#C586C0',
      token: 'keyword.control',
    },
    {
      foreground: '#C586C0',
      token: 'source.cpp keyword.operator.new',
    },
    {
      foreground: '#C586C0',
      token: 'keyword.operator.delete',
    },
    {
      foreground: '#C586C0',
      token: 'keyword.other.using',
    },
    {
      foreground: '#C586C0',
      token: 'keyword.other.operator',
    },
    {
      foreground: '#C586C0',
      token: 'entity.name.operator',
    },
    {
      foreground: '#9CDCFE',
      token: 'variable',
    },
    {
      foreground: '#9CDCFE',
      token: 'meta.definition.variable.name',
    },
    {
      foreground: '#9CDCFE',
      token: 'support.variable',
    },
    {
      foreground: '#9CDCFE',
      token: 'entity.name.variable',
    },
    {
      foreground: '#4FC1FF',
      token: 'variable.other.constant',
    },
    {
      foreground: '#4FC1FF',
      token: 'variable.other.enummember',
    },
    {
      foreground: '#9CDCFE',
      token: 'meta.object-literal.key',
    },
    {
      foreground: '#CE9178',
      token: 'support.constant.property-value',
    },
    {
      foreground: '#CE9178',
      token: 'support.constant.font-name',
    },
    {
      foreground: '#CE9178',
      token: 'support.constant.media-type',
    },
    {
      foreground: '#CE9178',
      token: 'support.constant.media',
    },
    {
      foreground: '#CE9178',
      token: 'constant.other.color.rgb-value',
    },
    {
      foreground: '#CE9178',
      token: 'constant.other.rgb-value',
    },
    {
      foreground: '#CE9178',
      token: 'support.constant.color',
    },
    {
      foreground: '#CE9178',
      token: 'punctuation.definition.group.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'punctuation.definition.group.assertion.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'punctuation.definition.character-class.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'punctuation.character.set.begin.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'punctuation.character.set.end.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'keyword.operator.negation.regexp',
    },
    {
      foreground: '#CE9178',
      token: 'support.other.parenthesis.regexp',
    },
    {
      foreground: '#d16969',
      token: 'constant.character.character-class.regexp',
    },
    {
      foreground: '#d16969',
      token: 'constant.other.character-class.set.regexp',
    },
    {
      foreground: '#d16969',
      token: 'constant.other.character-class.regexp',
    },
    {
      foreground: '#d16969',
      token: 'constant.character.set.regexp',
    },
    {
      foreground: '#DCDCAA',
      token: 'keyword.operator.or.regexp',
    },
    {
      foreground: '#DCDCAA',
      token: 'keyword.control.anchor.regexp',
    },
    {
      foreground: '#d7ba7d',
      token: 'keyword.operator.quantifier.regexp',
    },
    {
      foreground: '#569cd6',
      token: 'constant.character',
    },
    {
      foreground: '#d7ba7d',
      token: 'constant.character.escape',
    },
    {
      foreground: '#C8C8C8',
      token: 'entity.name.label',
    },
    {
      foreground: '#569CD6',
      token: 'constant.language',
    },
    {
      foreground: '#569CD6',
      token: 'entity.name.tag',
    },
    {
      foreground: '#569cd6',
      token: 'storage',
    },
  ],
  colors: {
    // 'editor.foreground': '#f8f8f2',
    // 'editor.background': '#282a36',
    // 'editor.selectionBackground': '#44475a',
    // // 'editor.lineHighlightBackground': '#44475a',
    // 'editor.lineHighlightBorder': '#44475a',
    // 'editorCursor.foreground': '#f8f8f0',
    // 'editorWhitespace.foreground': '#3B3A32',
    // 'editorIndentGuide.activeBackground': '#9D550FB0',
    // 'editor.selectionHighlightBorder': '#222218',
  },
  encodedTokensColors: [],
}
