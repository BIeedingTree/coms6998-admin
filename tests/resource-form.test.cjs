/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./harness.cjs');
const id = '00000000-0000-0000-0000-000000000001';
function formHarness() {
  let state = {}, previousDependencies;
  const scheduled = [], navigation = [];
  const router = { refresh: () => navigation.push('refresh'), replace: path => navigation.push(path) };
  const h = setup({ mocks: {
    react: { ...require('react'),
      useActionState: () => [state, () => {}, false],
      // Simulate React's dependency comparison across server-prop replacements.
      useEffect(effect, dependencies) {
        if (!previousDependencies || dependencies.some((value, i) => !Object.is(value, previousDependencies[i]))) scheduled.push(effect);
        previousDependencies = dependencies;
      },
    },
    'next/navigation': { useRouter: () => router },
  } });
  const Form = h.load('components/resource-form.tsx').ResourceForm;
  const resource = h.load('lib/admin-resources.ts').resourceFor('terms');
  return { navigation, setState: next => { state = next; }, render(row) {
    Form({resource, row, options: {}});
    scheduled.splice(0).forEach(effect => effect());
  } };
}
test('successful edit refreshes once, not again when server returns a new row object', () => {
  const h = formHarness();
  h.render({id,term:'Before'}); assert.deepEqual(h.navigation,[]);
  h.setState({id,message:'Saved to Supabase.'}); h.render({id,term:'Before'});
  assert.deepEqual(h.navigation,['refresh']);
  for(let i=0;i<5;i++) h.render({id,term:'After'});
  assert.deepEqual(h.navigation,['refresh']);
  h.setState({id,message:'Saved to Supabase.'}); h.render({id,term:'After'});
  assert.deepEqual(h.navigation,['refresh','refresh'],'a second submission still refreshes');
  h.setState({error:'Invalid input'}); h.render({id,term:'After'});
  assert.deepEqual(h.navigation,['refresh','refresh']);
});
test('creation navigates to the saved record once without refreshing the creation page', () => {
  const h = formHarness(); h.render(undefined);
  h.setState({id,message:'Saved to Supabase.'}); h.render(undefined); h.render(undefined);
  assert.deepEqual(h.navigation,[`/admin/terms/${id}?saved=1`]);
});
