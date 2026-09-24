import { describe, expect, it } from 'vitest'
import { AREAS } from '../db/semilla'
import { interpretarGafete, rpeParecido, similitud } from './gafete'

// Textos con el formato del gafete y los errores típicos del OCR (datos ficticios).
const LIMPIO = `CFE Laguna Verde
EDUARDO POE
RAMIREZ DEL VALLE SOTO
AREA:
OFICINA DE SEGURIDAD
INDUSTRIAL
JEFE DE OFICINA |
SEG. FISICA
NUCLEAR
4417
TX9Q4
15/03/2027`

const CON_RUIDO = `CFE  Laguna Verde
| MARIA JOSE =
LOPEZ HERNANDEZ ||| lil
AREA
MANTENIMIENTO ELECTRlCO
TECNICO ESPECIALISTA
|||| ||| ||||
2051  R7M2K  01/12/2026`

describe('lectura de gafetes', () => {
  it('extrae todos los datos de un gafete bien leído', () => {
    const d = interpretarGafete(LIMPIO, AREAS)
    expect(d).toEqual({
      rpe: 'TX9Q4',
      nombre: 'EDUARDO RAMIREZ DEL VALLE SOTO',
      area: 'OFICINA DE SEGURIDAD INDUSTRIAL',
      puesto: 'JEFE DE OFICINA I',
      numero: '4417',
      vigencia: '2027-03-15',
      areaSegura: true,
    })
  })

  it('tolera ruido del código de barras y letras mal leídas', () => {
    const d = interpretarGafete(CON_RUIDO, AREAS)
    expect(d.rpe).toBe('R7M2K')
    expect(d.nombre).toBe('MARIA JOSE LOPEZ HERNANDEZ')
    expect(d.area).toBe('MANTENIMIENTO ELÉCTRICO')
    expect(d.areaSegura).toBe(true)
    expect(d.puesto).toBe('TECNICO ESPECIALISTA')
    expect(d.numero).toBe('2051')
    expect(d.vigencia).toBe('2026-12-01')
  })

  it('mide la similitud de textos sin importar acentos', () => {
    expect(similitud('PROTECCION RADIOLOGICA', 'PROTECCIÓN RADIOLÓGICA')).toBe(1)
    expect(similitud('APOYO CONSTRUCTIVO', 'INFRA')).toBeLessThan(0.2)
  })

  it('corrige el RPE con el padrón cuando la cámara confunde caracteres', () => {
    const padron = ['TX6Q4', 'AB123', 'ZQ9X7']
    expect(rpeParecido('TXGQ4', padron)).toBe('TX6Q4')
    expect(rpeParecido('A8I23', padron)).toBe('AB123')
    expect(rpeParecido('ZZZZZ', padron)).toBe('')
    // Ambiguo: dos candidatos posibles, no se adivina
    expect(rpeParecido('C0DE1', ['CODE1', 'C0DEI'])).toBe('')
  })
})
