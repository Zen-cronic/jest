/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import chalk = require('chalk');
import Resolver from 'jest-resolve';
import {ValidationError} from 'jest-validate';
import {pathToFileURL} from 'url';

type ResolveOptions = {
  rootDir: string;
  key: string;
  filePath: string;
  optional?: boolean;
};

export const BULLET: string = chalk.bold('\u25CF ');
export const DOCUMENTATION_NOTE = `  ${chalk.bold(
  'Configuration Documentation:',
)}
  https://jestjs.io/docs/configuration
`;

const createValidationError = (message: string) =>
  new ValidationError(`${BULLET}Validation Error`, message, DOCUMENTATION_NOTE);

export const resolve = (
  resolver: string | null | undefined,
  {key, filePath, rootDir, optional}: ResolveOptions,
): string => {
  const module = Resolver.findNodeModule(
    replaceRootDirInPath(rootDir, filePath),
    {
      basedir: rootDir,
      resolver: resolver || undefined,
    },
  );

  if (!module && !optional) {
    throw createValidationError(
      `  Module ${chalk.bold(filePath)} in the ${chalk.bold(
        key,
      )} option was not found.
         ${chalk.bold('<rootDir>')} is: ${rootDir}`,
    );
  }
  /// can cast as string since nulls will be thrown
  return module!;
};

export const escapeGlobCharacters = (path: string): string => {
 

  // return   path.replaceAll(/([!()*?[\\\]{}])/g, '\\$1');

  const nonUnifiedPath = path.replaceAll(/([!()*?[\\\]{}])/g, '\\$1');
  //   C:\\\\...\\\\jest-forked\\\\bug-15132\\\\+folderStartingWithSpecialCharacter
  // '
  console.log({nonUnifiedPath});

  let unifiedPath = path.replaceAll(/\\/g, '/');
  //  //C:/../jest-forked/bug-15132/+folderStartingWithSpecialCharacter

  unifiedPath = unifiedPath.replaceAll(/([!()*?[\\\]{}])/g, '\\$1');

  //
  console.log({unifiedPath});

  return unifiedPath

  // return path.replaceAll(/([!()*?[\\\]{}])/g, '\\$1'); // undef
};

export const replaceRootDirInPath = (
  rootDir: string,
  filePath: string,
): string => {
  //filePath
  //C:\\..\\jest-forked\\bug-15132\\+folderStartingWithSpecialCharacter\\coverage
  // testMatch: '<rootDir>/**/test.js'
  // console.log({filePath});

  if (!filePath.startsWith('<rootDir>')) {
    // console.log("Early return from replaceRootdirInpath");

    return filePath;
  }

  //C:/../jest/jest-forked/bug-15132/+folderStartingWithSpecialCharacter
  console.log('glob escaped rootDir:', {rootDir});

  // const replacedBackslashRootDir = pathToFileURL(rootDir).pathname;
  // console.log({replacedBackslashRootDir});

  const resolvedReplaceRootDirInPath = path.resolve(
    rootDir,
    path.normalize(`./${filePath.slice('<rootDir>'.length)}`),
    // path.normalize(`./${escapeGlobCharacters(filePath).slice('<rootDir>'.length)}`),
  );

  //C:\\..\\bug-15132\\+folderStartingWithSpecialCharacter\\**\\test.js
  console.log({resolvedReplaceRootDirInPath});
  return resolvedReplaceRootDirInPath;

  // return path.resolve(
  //   rootDir,
  //   // replacedBackslashRootDir,
  //   path.normalize(`./${filePath.slice('<rootDir>'.length)}`),
  // );
};

const _replaceRootDirInObject = <T extends ReplaceRootDirConfigObj>(
  rootDir: string,
  config: T,
): T => {
  const newConfig = {} as T;
  for (const configKey in config) {
    newConfig[configKey] =
      configKey === 'rootDir'
        ? config[configKey]
        : _replaceRootDirTags(rootDir, config[configKey]);
  }
  return newConfig;
};

type OrArray<T> = T | Array<T>;
type ReplaceRootDirConfigObj = Record<string, string>;
type ReplaceRootDirConfigValues =
  | OrArray<ReplaceRootDirConfigObj>
  | OrArray<RegExp>
  | OrArray<string>;

export const _replaceRootDirTags = <T extends ReplaceRootDirConfigValues>(
  rootDir: string,
  config: T,
): T => {
  if (config == null) {
    return config;
  }
  switch (typeof config) {
    case 'object':
      if (Array.isArray(config)) {
        /// can be string[] or {}[]
        return config.map(item => _replaceRootDirTags(rootDir, item)) as T;
      }
      if (config instanceof RegExp) {
        return config;
      }

      return _replaceRootDirInObject(rootDir, config) as T;
    case 'string':
      return replaceRootDirInPath(rootDir, config) as T;
  }
  return config;
};

type JSONString = string & {readonly $$type: never}; // newtype
export const isJSONString = (text?: JSONString | string): text is JSONString =>
  text != null &&
  typeof text === 'string' &&
  text.startsWith('{') &&
  text.endsWith('}');
