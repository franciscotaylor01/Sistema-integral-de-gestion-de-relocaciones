import type { Assignee } from './seedTypes'

/* Fictional relocated employees and families — demo data only. */

export const mockAssignees: Assignee[] = [
  {
    id: 'asg_01', clientId: 'cli_nordvik', name: 'Erik Vermeulen', jobTitle: 'Reservoir Engineer', nationality: 'NL', email: 'erik.v@nordvik.example',
    family: [
      { id: 'fam_01', name: 'Lotte Vermeulen', relation: 'spouse' },
      { id: 'fam_02', name: 'Daan Vermeulen', relation: 'child', age: 9 },
      { id: 'fam_03', name: 'Fenna Vermeulen', relation: 'child', age: 6 },
    ],
  },
  {
    id: 'asg_02', clientId: 'cli_andes', name: 'Diego Fuentes', jobTitle: 'Gerente de Proyectos', nationality: 'CL', email: 'd.fuentes@andesminerals.example',
    family: [{ id: 'fam_04', name: 'Carolina Muñoz', relation: 'partner' }],
  },
  {
    id: 'asg_03', clientId: 'cli_helvion', name: 'Clara Baumann', jobTitle: 'Regional Medical Director', nationality: 'CH', email: 'c.baumann@helvion.example',
    family: [
      { id: 'fam_05', name: 'Jonas Baumann', relation: 'spouse' },
      { id: 'fam_06', name: 'Mia Baumann', relation: 'child', age: 12 },
    ],
  },
  {
    id: 'asg_04', clientId: 'cli_kestrel', name: 'Michael Torres', jobTitle: 'Plant Operations Manager', nationality: 'US', email: 'm.torres@kestrel.example',
    family: [],
  },
  {
    id: 'asg_05', clientId: 'cli_lumen', name: 'Agustina Méndez', jobTitle: 'Head of Product EU', nationality: 'AR', email: 'a.mendez@lumenfintech.example',
    family: [{ id: 'fam_07', name: 'Bruno Sanz', relation: 'partner' }],
  },
  {
    id: 'asg_06', clientId: 'cli_pampa', name: 'Rodrigo Sosa', jobTitle: 'Gerente Comercial Brasil', nationality: 'AR', email: 'r.sosa@pampaagritech.example',
    family: [
      { id: 'fam_08', name: 'Laura Giménez', relation: 'spouse' },
      { id: 'fam_09', name: 'Tomás Sosa', relation: 'child', age: 4 },
    ],
  },
  {
    id: 'asg_07', clientId: 'cli_nordvik', name: 'Ingrid Haugen', jobTitle: 'HSE Manager', nationality: 'NL', email: 'i.haugen@nordvik.example',
    family: [
      { id: 'fam_10', name: 'Sven Haugen', relation: 'spouse' },
      { id: 'fam_11', name: 'Nora Haugen', relation: 'child', age: 14 },
    ],
  },
  {
    id: 'asg_08', clientId: 'cli_andes', name: 'Valeria Castro', jobTitle: 'Geóloga Senior', nationality: 'CL', email: 'v.castro@andesminerals.example',
    family: [{ id: 'fam_12', name: 'Martina Castro', relation: 'child', age: 11 }],
  },
  {
    id: 'asg_09', clientId: 'cli_helvion', name: 'Lukas Meier', jobTitle: 'APAC Supply Chain Lead', nationality: 'CH', email: 'l.meier@helvion.example',
    family: [
      { id: 'fam_13', name: 'Sara Meier', relation: 'spouse' },
      { id: 'fam_14', name: 'Noah Meier', relation: 'child', age: 8 },
      { id: 'fam_15', name: 'Elena Meier', relation: 'child', age: 5 },
    ],
  },
  {
    id: 'asg_10', clientId: 'cli_kestrel', name: 'Ana Lucía Rivas', jobTitle: 'Quality Engineer', nationality: 'MX', email: 'a.rivas@kestrel.example',
    family: [],
  },
  {
    id: 'asg_11', clientId: 'cli_lumen', name: 'Federico Ibarra', jobTitle: 'Country Manager Uruguay', nationality: 'AR', email: 'f.ibarra@lumenfintech.example',
    family: [{ id: 'fam_16', name: 'Paula Ríos', relation: 'spouse' }],
  },
  {
    id: 'asg_12', clientId: 'cli_oceanic', name: 'Hannah Clarke', jobTitle: 'LATAM Operations Director', nationality: 'GB', email: 'h.clarke@oceanic.example',
    family: [
      { id: 'fam_17', name: 'James Clarke', relation: 'spouse' },
      { id: 'fam_18', name: 'Olivia Clarke', relation: 'child', age: 10 },
    ],
  },
  {
    id: 'asg_13', clientId: 'cli_pampa', name: 'Mariana Gil', jobTitle: 'Directora de Investigación', nationality: 'AR', email: 'm.gil@pampaagritech.example',
    family: [{ id: 'fam_19', name: 'Joaquín Gil', relation: 'child', age: 16 }],
  },
  {
    id: 'asg_14', clientId: 'cli_helvion', name: 'Paul Schneider', jobTitle: 'Market Access Manager', nationality: 'DE', email: 'p.schneider@helvion.example',
    family: [],
  },
  {
    id: 'asg_15', clientId: 'cli_brightwater', name: 'Jonas Weber', jobTitle: 'Senior Consultant', nationality: 'DE', email: 'j.weber@brightwater.example',
    family: [{ id: 'fam_20', name: 'Lena Weber', relation: 'partner' }],
  },
  {
    id: 'asg_16', clientId: 'cli_nordvik', name: 'Pieter de Groot', jobTitle: 'Offshore Drilling Supervisor', nationality: 'NL', email: 'p.degroot@nordvik.example',
    family: [{ id: 'fam_21', name: 'Anouk de Groot', relation: 'spouse' }],
  },
]
