import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { courseAdmission, filterUniversityCourses, universityCourseOptions } from '@/lib/university-catalogue';
import UniversityCareerList, { type UniversityCareer } from '@/app/universidades/[slug]/career-list';
import PartnerShowcase from '@/app/universidades/[slug]/partner-showcase';

const courses: UniversityCareer[] = [
  { id:'a',slug:'informatica-alcala',name:'Grado en Ingeniería Informática',branch:'ingenieria_arquitectura',campus:'Alcalá de Henares',cut_off_score:12.135,cut_off_year:2026,duration_years:4 },
  { id:'b',name:'Grado en Enfermería',branch:'ciencias_salud',campus:'Guadalajara',cut_off_score:11.95,cut_off_year:2025,duration_years:4 },
  { id:'c',name:'Grado en Enfermería',branch:'ciencias_salud',campus:'Alcalá de Henares',cut_off_score:null,cut_off_year:2026,duration_years:4,admission_without_cutoff:true },
];

describe('University catalogue choices',()=>{
  it('finds words in any order across degree and campus without accents',()=>{
    expect(filterUniversityCourses(courses,{query:'  ALCALA    informatica '})).toEqual([courses[0]]);
  });
  it('combines branch and campus and preserves separate offers for the same degree',()=>{
    expect(filterUniversityCourses(courses,{branch:'ciencias_salud'}).map(c=>c.id)).toEqual(['c','b']);
    expect(filterUniversityCourses(courses,{branch:'ciencias_salud',campus:'Guadalajara'}).map(c=>c.id)).toEqual(['b']);
  });
  it('does not substitute another campus when the chosen combination has no results',()=>{
    expect(filterUniversityCourses(courses,{branch:'ingenieria_arquitectura',campus:'Guadalajara'})).toEqual([]);
  });
  it('searches readable branch labels without changing input order',()=>{
    const original=courses.map(c=>c.id);
    expect(filterUniversityCourses(courses,{query:'salud'})).toHaveLength(2);
    expect(courses.map(c=>c.id)).toEqual(original);
  });
  it('builds distinct choices and ignores missing campus values',()=>{
    expect(universityCourseOptions([...courses,{...courses[0],id:'d',campus:' Alcalá de Henares '},{...courses[0],id:'e',campus:null}],'campus')).toEqual(['Alcalá de Henares','Guadalajara']);
  });
  it('preserves all three decimals and the reference course',()=>{
    expect(courseAdmission(courses[0])).toMatchObject({label:'12,135',period:'2026/2027'});
  });
  it.each([null,0,4.999,14.001,NaN,Infinity])('does not present %s as a valid cutoff',score=>{
    expect(courseAdmission({...courses[0],cut_off_score:score})).toMatchObject({label:'Consultar',score:null});
  });
  it('does not infer admission without a cutoff from an absent number',()=>{
    expect(courseAdmission({...courses[0],cut_off_score:null}).label).toBe('Consultar');
    expect(courseAdmission(courses[2])).toMatchObject({label:'Sin corte',period:'2026/2027',note:'Consulta los requisitos de acceso',score:null});
  });
  it('does not assign a year to an undated reference',()=>{
    expect(courseAdmission({...courses[0],cut_off_year:null}).period).toBe('Curso por confirmar');
  });
  it('uses the same interpretation on web and mobile',()=>{
    expect(fs.readFileSync(path.resolve('../mobile/src/lib/university-catalogue.ts'),'utf8')).toBe(fs.readFileSync(path.resolve('src/lib/university-catalogue.ts'),'utf8'));
  });
});

describe('University catalogue interaction',()=>{
  it('combines real controls, recovers from no results and preserves destination links',()=>{
    render(<UniversityCareerList careers={courses}/>);
    fireEvent.change(screen.getByRole('combobox',{name:'Campus o centro'}),{target:{value:'Guadalajara'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Rama de estudios'}),{target:{value:'ingenieria_arquitectura'}});
    expect(screen.getByText('No encontramos una coincidencia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Quitar filtros'}));
    expect(screen.getByRole('link',{name:/Grado en Ingeniería Informática/})).toHaveAttribute('href','/carreras/informatica-alcala');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
  it('resets the visible page when searching after expanding a large catalogue',()=>{
    const many=Array.from({length:30},(_,i)=>({...courses[0],id:`course-${i}`,name:`Grado ${String(i).padStart(2,'0')}`}));
    render(<UniversityCareerList careers={many}/>);
    expect(screen.getAllByRole('link')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button',{name:'Ver más ofertas (18)'}));
    expect(screen.getAllByRole('link')).toHaveLength(30);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'grado'}});
    expect(screen.getAllByRole('link')).toHaveLength(12);
  });
  it('explains an empty catalogue without reporting a failed search',()=>{
    render(<UniversityCareerList careers={[]}/>);
    expect(screen.getByText('Estamos ampliando este catálogo')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Quitar filtros'})).not.toBeInTheDocument();
  });
});

describe('Partner course links',()=>{
  const uni={name:'Universidad de prueba',partner_tier:null,partner_since:null,partner_blurb:null,intro_video_url:null,gallery_urls:['https://example.org/campus.jpg'],jpa_url:null,jpa_label:null,featured_career_ids:[]};
  it('does not label the first alphabetical results as chosen highlights',()=>{
    render(<PartnerShowcase uni={uni} careers={courses}/>);
    expect(screen.queryByText('Grados destacados')).not.toBeInTheDocument();
  });
  it('shows selected offers only once with an actionable link and the cutoff year',()=>{
    render(<PartnerShowcase uni={{...uni,featured_career_ids:['a','missing','a']}} careers={courses}/>);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href','/carreras/informatica-alcala');
    expect(screen.getByText('2026/2027')).toBeInTheDocument();
    expect(screen.getByText('12,135')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
