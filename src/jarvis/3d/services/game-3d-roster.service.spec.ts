import { Game3DRosterService } from './game-3d-roster.service';

describe('Game3DRosterService', () => {
  let service: Game3DRosterService;

  beforeEach(() => {
    service = new Game3DRosterService();
  });

  it('returns all characters with complete telemetries and Three.js configs', () => {
    const characters = service.getAllCharacters();
    expect(characters.length).toBeGreaterThanOrEqual(4);

    const bee = service.getCharacterById('bee');
    expect(bee).toBeDefined();
    expect(bee?.realMetrics.propulsion).toContain('Alas');
    expect(bee?.renderConfig.scale).toBeDefined();
    expect(bee?.audio.soundKey).toBe('bee_buzz');

    const ironMan = service.getCharacterById('iron_man');
    expect(ironMan).toBeDefined();
    expect(ironMan?.renderConfig.hasThrusterFX).toBe(true);
    expect(ironMan?.realMetrics.maxSpeedKmh).toContain('Mach');
  });

  it('returns Hall of Armors roster with accurate pod coordinates and reactor specs', () => {
    const armors = service.getHallOfArmors();
    expect(armors.length).toBe(5);

    const mark7 = service.getArmorById('armor_mark7');
    expect(mark7).toBeDefined();
    expect(mark7?.designation).toContain('MARK VII');
    expect(mark7?.position).toEqual([13.4, 0.0, -2.2]);

    const heartbreaker = service.getArmorById('armor_heartbreaker');
    expect(heartbreaker?.reactorType).toContain('Chest RT');
  });

  it('returns null when querying non-existent character or armor', () => {
    expect(service.getCharacterById('unknown_avatar')).toBeNull();
    expect(service.getArmorById('unknown_armor')).toBeNull();
  });
});
