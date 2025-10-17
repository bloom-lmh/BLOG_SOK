# Javascript API

`Rollup` 提供了一个可在 `Node.js` 中使用的 `JavaScript API`。你很少需要使用它，并且可能应该尽可能使用命令行 `API`，除非你要扩展 `Rollup` 本身或将其用于一些深奥的事情，例如以编程方式生成打包包。

## rollup.rollup

1. 创建`bundle`对象：`rollup.rollup` 函数接收输入选项对象作为参数，并返回一个 `Promise`，该 `Promise` 解析为具有各种属性和方法的 `bundle` 对象，如下所示。在此步骤中，`Rollup` 将构建模块图并执行 `tree-shaking`，但不会生成任何输出。
2. 根据`bundle` 对象输出包：在 `bundle` 对象上，你可以使用不同的输出选项对象多次调用 `bundle.generate`，以在**内存**中生成不同的包。如果你想直接将它们写入磁盘，请改用 `bundle.write`。
3. 清除进程：完成 `bundle` 对象后，你应该调用 `bundle.close()`，这将让插件通过 `closeBundle` 钩子清理其外部进程或服务。

```javascript
import { rollup } from 'rollup';

// see below for details on these options
const inputOptions = {
  /* ... */
};

// you can create multiple outputs from the same input to generate e.g.
// different formats like CommonJS and ESM
const outputOptionsList = [
  {
    /* ... */
  },
  {
    /* ... */
  },
];

build();

async function build() {
  let bundle;
  let buildFailed = false;
  try {
    // Create a bundle. If you are using TypeScript or a runtime that
    // supports it, you can write
    //
    // await using bundle = await rollup(inputOptions);
    //
    // instead and do not need to close the bundle explicitly below.
    bundle = await rollup(inputOptions);

    // an array of file names this bundle depends on
    console.log(bundle.watchFiles);

    await generateOutputs(bundle);
  } catch (error) {
    buildFailed = true;
    // do some error reporting
    console.error(error);
  }
  if (bundle) {
    // closes the bundle
    await bundle.close();
  }
  process.exit(buildFailed ? 1 : 0);
}

async function generateOutputs(bundle) {
  for (const outputOptions of outputOptionsList) {
    // generate output specific code in-memory
    // you can call this function multiple times on the same bundle object
    // replace bundle.generate with bundle.write to directly write to disk
    const { output } = await bundle.generate(outputOptions);

    for (const chunkOrAsset of output) {
      if (chunkOrAsset.type === 'asset') {
        // For assets, this contains
        // {
        //   fileName: string,              // the asset file name
        //   source: string | Uint8Array    // the asset source
        //   type: 'asset'                  // signifies that this is an asset
        // }
        console.log('Asset', chunkOrAsset);
      } else {
        // For chunks, this contains
        // {
        //   code: string,                  // the generated JS code
        //   dynamicImports: string[],      // external modules imported dynamically by the chunk
        //   exports: string[],             // exported variable names
        //   facadeModuleId: string | null, // the id of a module that this chunk corresponds to
        //   fileName: string,              // the chunk file name
        //   implicitlyLoadedBefore: string[]; // entries that should only be loaded after this chunk
        //   imports: string[],             // external modules imported statically by the chunk
        //   importedBindings: {[imported: string]: string[]} // imported bindings per dependency
        //   isDynamicEntry: boolean,       // is this chunk a dynamic entry point
        //   isEntry: boolean,              // is this chunk a static entry point
        //   isImplicitEntry: boolean,      // should this chunk only be loaded after other chunks
        //   map: string | null,            // sourcemaps if present
        //   modules: {                     // information about the modules in this chunk
        //     [id: string]: {
        //       renderedExports: string[]; // exported variable names that were included
        //       removedExports: string[];  // exported variable names that were removed
        //       renderedLength: number;    // the length of the remaining code in this module
        //       originalLength: number;    // the original length of the code in this module
        //       code: string | null;       // remaining code in this module
        //     };
        //   },
        //   name: string                   // the name of this chunk as used in naming patterns
        //   preliminaryFileName: string    // the preliminary file name of this chunk with hash placeholders
        //   referencedFiles: string[]      // files referenced via import.meta.ROLLUP_FILE_URL_<id>
        //   type: 'chunk',                 // signifies that this is a chunk
        // }
        console.log('Chunk', chunkOrAsset.modules);
      }
    }
  }
}
```

如果任一阶段发生错误，它将返回一个被错误拒绝的 `Promise`，你可以通过其 `code` 属性来识别该错误。除了 `code` 和 `message` 之外，许多错误还具有可用于自定义报告的其他属性，请参阅 `utils/logs.ts` 以获取错误和日志及其代码和属性的完整列表。

## inputOptions 对象

`inputOptions` 对象可以包含以下属性（有关这些属性的完整详细信息，请参阅 选项清单）：

```javascript
const inputOptions = {
  // core input options
  external,
  input, // conditionally required
  plugins,

  // advanced input options
  cache,
  logLevel,
  makeAbsoluteExternalsRelative,
  maxParallelFileOps,
  onLog,
  onwarn,
  preserveEntrySignatures,
  strictDeprecations,

  // danger zone
  context,
  moduleContext,
  preserveSymlinks,
  shimMissingExports,
  treeshake,

  // experimental
  experimentalCacheExpiry,
  experimentalLogSideEffects,
  perf,
  fs,
};
```

## outputOptions 对象

`outputOptions` 对象可以包含以下属性（有关这些属性的完整详细信息，请参阅 选项清单）：

```javascript
const outputOptions = {
  // core output options
  dir,
  file,
  format,
  globals,
  name,
  plugins,

  // advanced output options
  assetFileNames,
  banner,
  chunkFileNames,
  compact,
  dynamicImportInCjs,
  entryFileNames,
  extend,
  externalImportAttributes,
  footer,
  generatedCode,
  hashCharacters,
  hoistTransitiveImports,
  importAttributesKey,
  inlineDynamicImports,
  interop,
  intro,
  manualChunks,
  minifyInternalExports,
  outro,
  paths,
  preserveModules,
  preserveModulesRoot,
  sourcemap,
  sourcemapBaseUrl,
  sourcemapDebugIds,
  sourcemapExcludeSources,
  sourcemapFile,
  sourcemapFileNames,
  sourcemapIgnoreList,
  sourcemapPathTransform,
  validate,

  // danger zone
  amd,
  esModule,
  exports,
  externalLiveBindings,
  freeze,
  indent,
  noConflict,
  reexportProtoFromExternal,
  sanitizeFileName,
  strict,
  systemNullSetters,

  // experimental
  experimentalMinChunkSize,
};
```

## rollup.watch

`Rollup` 还提供了 `rollup.watch` 功能，当它检测到磁盘上的各个模块已更改时，可以重建你的打包包。当你使用 `--watch` 标志从命令行运行 `Rollup` 时，它会在内部使用`rollup.watch`。请注意，当通过 `JavaScript API` 使用监视模式时，你有责任调用 `event.result.close()` 来响应 `BUNDLE_END` 事件，以允许插件清理 `closeBundle` 钩子中的资源，请参见下文。

```javascript
const rollup = require('rollup');

const watchOptions = {
  /*...*/
};
const watcher = rollup.watch(watchOptions);

watcher.on('event', event => {
  // event.code can be one of:
  //   START        — the watcher is (re)starting
  //   BUNDLE_START — building an individual bundle
  //                  * event.input will be the input options object if present
  //                  * event.output contains an array of the "file" or
  //                    "dir" option values of the generated outputs
  //   BUNDLE_END   — finished building a bundle
  //                  * event.input will be the input options object if present
  //                  * event.output contains an array of the "file" or
  //                    "dir" option values of the generated outputs
  //                  * event.duration is the build duration in milliseconds
  //                  * event.result contains the bundle object that can be
  //                    used to generate additional outputs by calling
  //                    bundle.generate or bundle.write. This is especially
  //                    important when the watch.skipWrite option is used.
  //                  You should call "event.result.close()" once you are done
  //                  generating outputs, or if you do not generate outputs.
  //                  This will allow plugins to clean up resources via the
  //                  "closeBundle" hook.
  //   END          — finished building all bundles
  //   ERROR        — encountered an error while bundling
  //                  * event.error contains the error that was thrown
  //                  * event.result is null for build errors and contains the
  //                    bundle object for output generation errors. As with
  //                    "BUNDLE_END", you should call "event.result.close()" if
  //                    present once you are done.
  // If you return a Promise from your event handler, Rollup will wait until the
  // Promise is resolved before continuing.
});

// This will make sure that bundles are properly closed after each run
watcher.on('event', ({ result }) => {
  if (result) {
    result.close();
  }
});

// Additionally, you can hook into the following. Again, return a Promise to
// make Rollup wait at that stage:
watcher.on('change', (id, { event }) => {
  /* a file was modified */
});
watcher.on('restart', () => {
  /* a new run was triggered */
});
watcher.on('close', () => {
  /* the watcher was closed, see below */
});

// to stop watching
watcher.close();
```

## watchOptions

`watchOptions` 参数是你将从配置文件导出的配置（或配置数组）。

```javascript
const watchOptions = {
  ...inputOptions,
  output: [outputOptions],
  watch: {
    allowInputInsideOutputPath,
    buildDelay,
    chokidar,
    clearScreen,
    skipWrite,
    exclude,
    include,
  },
};
```

## 以编程方式加载配置文件

`Rollup` 通过 `loadConfigFile`公开了其内部加载配置文件的逻辑（命令行工具 `rollup --config`也使用此逻辑）。它允许你在代码中加载配置文件，并动态修改配置（类似命令行参数的覆盖效果）

```js
const { loadConfigFile } = require('rollup/loadConfigFile');
const path = require('node:path');
const rollup = require('rollup');

// load the config file next to the current script;
// the provided config object has the same effect as passing "--format es"
// on the command line and will override the format of all outputs
loadConfigFile(path.resolve(__dirname, 'rollup.config.js'), {
  format: 'es',
}).then(async ({ options, warnings }) => {
  // "warnings" wraps the default `onwarn` handler passed by the CLI.
  // This prints all warnings up to this point:
  console.log(`We currently have ${warnings.count} warnings`);

  // This prints all deferred warnings
  warnings.flush();

  // options is an array of "inputOptions" objects with an additional
  // "output" property that contains an array of "outputOptions".
  // The following will generate all outputs for all inputs, and write
  // them to disk the same way the CLI does it:
  for (const optionsObj of options) {
    const bundle = await rollup.rollup(optionsObj);
    await Promise.all(optionsObj.output.map(bundle.write));
  }

  // You can also pass this directly to "rollup.watch"
  rollup.watch(options);
});
```

## 应用高级日志过滤器

`Rollup` 公开了一个辅助程序 `getLogFilter`，以使用与 `CLI` 相同的语法生成过滤器。当指定自定义 `onLog` 处理程序以及想要提供与 `Rollup CLI` 类似的过滤体验的第三方系统时，这非常有用。该函数接受一个字符串数组。请注意，它不会像 CLI 那样分割以逗号分隔的过滤器列表

```js
// rollup.config.mjs
import { getLogFilter } from 'rollup/getLogFilter';

const logFilter = getLogFilter(['code:FOO', 'code:BAR']);

export default {
  input: 'main.js',
  output: { format: 'es' },
  onLog(level, log, handler) {
    if (logFilter(log)) {
      handler(level, log);
    }
  },
};
```

## 访问解析器

为了使用 `Rollup` 的解析器解析任意代码(插件可以使用 `this.parse`)。要在 `Rollup` 构建的上下文之外使用此功能，解析器也会作为单独的导出公开。它与 `this.parse` 具有相同的签名：

```js
function parse(code: string, options?: object): AST
```

- 参数 1 (`code`)​​：要解析的代码字符串。
- 参数 2 (`options`, 可选)​​：配置选项，通常可以指定代码的模块格式（如 `module: 'esm'`）等。
- 返回值 (`AST`)​​：返回一个抽象语法树。这是最关键的部分，解析器不是执行代码，而是将代码的结构分析成一个包含丰富信息的树状数据对象，你可以遍历这个对象来理解代码。

比如：

```js
import { parseAst } from 'rollup/parseAst';
import assert from 'node:assert';

assert.deepEqual(parseAst('return 42;', { allowReturnOutsideFunction: true }), {
  type: 'Program',
  start: 0,
  end: 10,
  body: [
    {
      type: 'ReturnStatement',
      start: 0,
      end: 10,
      argument: {
        type: 'Literal',
        start: 7,
        end: 9,
        raw: '42',
        value: 42,
      },
    },
  ],
  sourceType: 'module',
});
```

::: tip 理解
`​Rollup` 将其高质量的解析器作为一个通用工具开放了出来，无论是在插件内还是插件外，你都可以用相同的方式调用它，将代码字符串转换为抽象语法树（`AST`）进行分析
:::
