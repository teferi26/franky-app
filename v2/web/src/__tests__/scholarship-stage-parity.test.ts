import { describe, expect, it } from 'vitest';
import { nivelMatchInfo as web } from '../lib/becas';
import { nivelMatchInfo as mobile, type NivelValue } from '../../../mobile/src/lib/becas';

describe.each([['web',web],['mobile',mobile]] as const)('%s research-stage matching', (_, match) => {
  it.each([
    [['postdoctorado'],'doctorado','no_match'],
    [['postdoc','investigacion'],'doctorado','no_match'],
    [['postdoc'],'postdoctorado','match'],
    [['contrato_predoctoral'],'postdoctorado','no_match'],
    [['doctorado','postdoctorado','discapacidad'],'doctorado','match'],
    [['doctorado','postdoctorado','discapacidad'],'postdoctorado','match'],
    [['investigacion'],'doctorado','sin_datos'],
    [['investigacion'],'postdoctorado','sin_datos'],
    [['investigacion'],'grado','no_match'],
  ])('matches %j for %s as %s', (audience, stage, expected) => {
    expect(match(audience as string[], stage as NivelValue)).toBe(expected);
  });
});
