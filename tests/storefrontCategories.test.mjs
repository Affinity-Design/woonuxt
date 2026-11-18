import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {isRetiredStorefrontCategory} from '../utils/storefrontCategories.mjs';

test('category discovery excludes retired departments and their deeper categories', () => {
  const slugs = [
    'scooters',
    'scooter-parts',
    'trick-scooters',
    'skateboards-and-longboards',
    'board-wheels',
    'penny-boards',
    'winter-sports',
    'alpine-ski-boots',
    'nordic-ski-boots',
    'roller-skis',
    'rollerski-parts-accessoires',
    'ski-wax',
  ];
  assert.deepEqual(
    slugs.filter((slug) => !isRetiredStorefrontCategory(slug)),
    [],
  );
});

test('keeps skating, ice skating and shared product categories available', () => {
  for (const slug of [
    'inline-skating',
    'inline-skates',
    'roller-skates',
    'ice-skates',
    'skate-tools',
    'replacement-parts',
    'clearance-items',
    'children-products',
  ]) {
    assert.equal(isRetiredStorefrontCategory(slug), false, slug);
  }
});

test('desktop, mobile and directory navigation share only active departments', () => {
  const source = readFileSync(new URL('../data/navigation.ts', import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}});
  const context = {exports: {}};
  vm.runInNewContext(outputText, context);
  const {navigation} = context.exports;
  assert.deepEqual(
    Array.from(navigation, (item) => item.slug),
    ['inline-skating', 'roller-skating', 'protection-gear-and-apparel'],
  );
  for (const department of navigation) {
    for (const group of department.groups) {
      for (const item of group.items) {
        assert.equal(isRetiredStorefrontCategory(item.slug), false, item.label);
      }
    }
  }
});
