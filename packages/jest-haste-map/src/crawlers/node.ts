/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {spawn} from 'child_process';
import * as path from 'path';
import * as fs from 'graceful-fs';
// import * as fs from 'fs';
import H from '../constants';
import * as fastPath from '../lib/fast_path';
import type {
  CrawlerOptions,
  FileData,
  IgnoreMatcher,
  InternalHasteMap,
} from '../types';
import chalk = require('chalk');

type Result = Array<[/* id */ string, /* mtime */ number, /* size */ number]>;

type Callback = (result: Result) => void;

async function hasNativeFindSupport(
  forceNodeFilesystemAPI: boolean,
): Promise<boolean> {
  if (forceNodeFilesystemAPI) {
    return false;
  }

  try {
    return await new Promise(resolve => {
      // Check the find binary supports the non-POSIX -iname parameter wrapped in parens.
      const args = [
        '.',
        '-type',
        'f',
        '(',
        '-iname',
        '*.ts',
        '-o',
        '-iname',
        '*.js',
        ')',
      ];
      const child = spawn('find', args, {cwd: __dirname});
      child.on('error', () => {
        resolve(false);
      });
      child.on('exit', code => {
        resolve(code === 0);
      });
    });
  } catch {
    return false;
  }
}

function find(
  roots: Array<string>,
  extensions: Array<string>,
  ignore: IgnoreMatcher,
  enableSymlinks: boolean,
  callback: Callback,
): void {
  const result: Result = [];
  let activeCalls = 0;

  console.warn('\t' + 'Entering', find.name);

  function search(directory: string): void {
    // console.trace("search")

    //1 C:\...jest-forked\bug-15132\+folderStartingWithSpecialCharacter
    //2 C:\...jest-forked\bug-15132\+folderStartingWithSpecialCharacter\node_modules
    console.warn('\t' + 'Current Searched dir', directory);

    activeCalls++;
    fs.readdir(directory, {withFileTypes: true}, (err, entries) => {
      activeCalls--;
      console.warn('\tcurrent activeCalls count from find()', activeCalls);

      if (err) {
        // throw err
        if (activeCalls === 0) {
          callback(result);
        }
        return;
      }
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        // console.log({file});

        if (ignore(file)) {
          console.warn("\tignore fn called on file", file);
          
          continue;
        }

        if (entry.isSymbolicLink()) {
          console.log({symbolicLinkEntry: entry});

          continue;
        }else{
          console.log("\tfile is NOT a symbolic link from search() from find()");
          
        }
        // ignore node_modules/ for now
        // if (entry.isDirectory()) {
        //   search(file);
        //   continue;
        // }

        activeCalls++;
        // console.log({enableSymlinks}); //false
        
        //orig
        // const stat = enableSymlinks ? fs.stat : fs.lstat;

        const stat = fs.stat 

        // console.log({statFn: stat});
        // console.log( stat); //[Function (anonymous)]
        try {
          // C:\... \+
          console.log({accessFile:file});
          
          fs.accessSync(file, fs.constants.F_OK)
          // console.log(chalk.greenBright("CAN ACCESS FILE"));
          
        } catch (error) {
          throw error
        }
        stat(file, (err, stat) => {
        // stat(file.replace(/\\/, "/"), (err, stat) => {
          // console.log({fileFromStat: file});
          
          activeCalls--;

          if(err){
            console.error("fs.stat error code:", err.code);
            
            console.log({err});
            return callback(result);
            
          }else{
            console.log({noErr: err});
            
          }
          // console.log({stat});
          
          // This logic is unnecessary for node > v10.10, but leaving it in
          // since we need it for backwards-compatibility still.
          if (!err && stat && !stat.isSymbolicLink()) {
            if (stat.isDirectory()) {
              console.log(chalk.magenta('Another search() entered'));

              search(file);
            } else {
              console.log(chalk.magenta('Another search() NOT entered'));

              const ext = path.extname(file).slice(1);
              if (extensions.includes(ext)) {
                result.push([file, stat.mtime.getTime(), stat.size]);
              }
            }
          }

          if (activeCalls === 0) {
            console.error(
              '\tInner activeCalls have reached 0 so',
              callback.name,
              'called',
            );

            callback(result);
          }
        });
      }

      //NOT 0 in bug, 0 in bug:anti
      //cuz stat NOT invoked, thus active NOT decremented
      if(activeCalls !== 0){
        throw new Error("Jello: activeCalls not 0")
      }
      if (activeCalls === 0) {
        console.error(
          '\tactiveCalls have reached 0 so',
          callback.name,
          'called',
        );

        callback(result);
      }
      console.warn('\tFinal activeCalls count from find()', activeCalls);
    });

    // console.warn("\tFinal activeCalls count from find()", activeCalls ); // 1
  }

  // console.warn("\tFinal activeCalls count from find()", activeCalls ); // 0

  console.warn('\t' + 'roots.length from', find.name, roots.length); //1

  if (roots.length > 0) {
    for (const root of roots) search(root);
  } else {
    callback(result);
  }
}

function findNative(
  roots: Array<string>,
  extensions: Array<string>,
  ignore: IgnoreMatcher,
  enableSymlinks: boolean,
  callback: Callback,
): void {
  const args = [...roots];
  if (enableSymlinks) {
    args.push('(', '-type', 'f', '-o', '-type', 'l', ')');
  } else {
    args.push('-type', 'f');
  }

  if (extensions.length > 0) {
    args.push('(');
  }
  for (const [index, ext] of extensions.entries()) {
    if (index) {
      args.push('-o');
    }
    args.push('-iname', `*.${ext}`);
  }
  if (extensions.length > 0) {
    args.push(')');
  }

  const child = spawn('find', args);
  let stdout = '';
  if (child.stdout === null) {
    throw new Error(
      'stdout is null - this should never happen. Please open up an issue at https://github.com/jestjs/jest',
    );
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => (stdout += data));

  child.stdout.on('close', () => {
    const lines = stdout
      .trim()
      .split('\n')
      .filter(x => !ignore(x));
    const result: Result = [];
    let count = lines.length;
    if (count) {
      for (const path of lines) {
        fs.stat(path, (err, stat) => {
          // Filter out symlinks that describe directories
          if (!err && stat && !stat.isDirectory()) {
            result.push([path, stat.mtime.getTime(), stat.size]);
          }
          if (--count === 0) {
            callback(result);
          }
        });
      }
    } else {
      callback([]);
    }
  });
}

export async function nodeCrawl(options: CrawlerOptions): Promise<{
  removedFiles: FileData;
  hasteMap: InternalHasteMap;
}> {
  const {
    data,
    extensions,
    forceNodeFilesystemAPI,
    ignore,
    rootDir,
    enableSymlinks,
    roots,
  } = options;

  const useNativeFind = await hasNativeFindSupport(forceNodeFilesystemAPI);
  console.log({useNativeFind}); //false

  return new Promise(resolve => {
    const callback = (list: Result) => {
      const files = new Map();
      const removedFiles = new Map(data.files);
      for (const fileData of list) {
        const [filePath, mtime, size] = fileData;
        const relativeFilePath = fastPath.relative(rootDir, filePath);
        console.warn('\trelativeFilePath w/ fastPath', relativeFilePath);

        const existingFile = data.files.get(relativeFilePath);
        if (existingFile && existingFile[H.MTIME] === mtime) {
          files.set(relativeFilePath, existingFile);
        } else {
          // See ../constants.js; SHA-1 will always be null and fulfilled later.
          files.set(relativeFilePath, ['', mtime, size, 0, '', null]);
        }
        removedFiles.delete(relativeFilePath);
      }
      data.files = files;
      // console.log({hasteMap: data}); //DNLog

      resolve({
        hasteMap: data,
        removedFiles,
      });
    };

    if (useNativeFind) {
      findNative(roots, extensions, ignore, enableSymlinks, callback);
    } else {
      find(roots, extensions, ignore, enableSymlinks, callback);
    }
  });
}
