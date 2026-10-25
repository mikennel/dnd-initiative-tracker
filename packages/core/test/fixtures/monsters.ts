import type { DdbMonster } from '../../src/ddb/types.ts';

/** Shaped like monster-service output for the 2024 Beholder (abridged descriptions). */
export const beholder2024: DdbMonster = {
  id: 5194923,
  name: 'Beholder',
  isLegacy: false,
  isHomebrew: false,
  isLegendary: true,
  hasLair: true,
  sizeId: 5,
  typeId: 1,
  alignmentId: 9,
  armorClass: 18,
  armorClassDescription: '',
  averageHitPoints: 190,
  hitPointDice: { diceCount: 20, diceValue: 10, fixedValue: 80, diceString: '20d10 + 80' },
  initiativeBonus: 12,
  passivePerception: 22,
  challengeRatingId: 17,
  stats: [
    { statId: 1, value: 16 }, { statId: 2, value: 14 }, { statId: 3, value: 18 },
    { statId: 4, value: 17 }, { statId: 5, value: 15 }, { statId: 6, value: 17 },
  ],
  savingThrows: [{ statId: 3, bonusModifier: null }, { statId: 5, bonusModifier: null }],
  skills: [{ skillId: 14, value: 12, additionalBonus: null }],
  senses: [{ senseId: 2, notes: '120 ft.' }],
  movements: [{ movementId: 1, speed: 5, notes: null }, { movementId: 4, speed: 40, notes: '(hover)' }],
  languageDescription: 'Deep Speech, Undercommon',
  damageAdjustments: [],
  conditionImmunities: [12],
  specialTraitsDescription:
    '<p><em><strong>Legendary Resistance (3/Day, or 4/Day in Lair).</strong></em> If the beholder fails a saving throw, it can choose to succeed instead.</p>',
  actionsDescription: [
    '<p><em><strong>Multiattack.</strong> </em>The beholder uses Eye Rays three times.</p>',
    '<p><em><strong>Bite.</strong></em> <em>Melee Attack Roll:</em> <span data-dicenotation="1d20+8" data-rolltype="to hit" data-rollaction="Bite">+8</span>, reach 5 ft. <em>Hit:</em> 13 <span data-dicenotation="3d6+3" data-rolltype="damage" data-rollaction="Bite" data-rolldamagetype="Piercing">(3d6 + 3)</span> Piercing damage.</p>',
    '<p><em><strong>Eye Rays.</strong></em> The beholder randomly shoots one of the following magical rays:</p>',
    '<p><strong>1: Charm Ray.</strong> <em>Wisdom Saving Throw:</em> DC 16.</p>',
  ].join('\n'),
  legendaryActionsDescription: [
    '<p class="legendary-actions">Legendary Action Uses: 3 (4 in Lair). Immediately after another creature’s turn, the beholder can expend a use to take one of the following actions.</p>',
    '<p><em><strong>Chomp.</strong></em> The beholder makes two Bite attacks.</p>',
    '<p><em><strong>Glare.</strong></em> The beholder uses Eye Rays.</p>',
  ].join('\n'),
  avatarUrl: 'https://www.dndbeyond.com/avatars/beholder.jpeg',
  url: 'https://www.dndbeyond.com/monsters/5194923-beholder',
};

/** Legacy-style dragon + caster features to exercise the resource parser. */
export const legacyDragonMage: DdbMonster = {
  id: 1,
  name: 'Test Dragon Mage',
  isLegacy: true,
  sizeId: 6,
  typeId: 6,
  armorClass: 19,
  averageHitPoints: 256,
  hitPointDice: { diceCount: 19, diceValue: 12, fixedValue: 133, diceString: '19d12 + 133' },
  initiativeBonus: null,
  challengeRatingId: 21,
  stats: [
    { statId: 1, value: 27 }, { statId: 2, value: 10 }, { statId: 3, value: 25 },
    { statId: 4, value: 16 }, { statId: 5, value: 13 }, { statId: 6, value: 21 },
  ],
  damageAdjustments: [25, 1],
  specialTraitsDescription: [
    '<p><strong><em>Spellcasting.</em></strong> The dragon is a 9th-level spellcaster (spell save DC 17). It has the following wizard spells prepared:</p>',
    '<p>Cantrips (at will): <em>fire bolt</em>, <em>light</em></p>',
    '<p>1st level (4 slots): <em>magic missile</em>, <em>shield</em></p>',
    '<p>2nd level (3 slots): <em>misty step</em></p>',
    '<p><strong><em>Innate Spellcasting.</em></strong> The dragon can innately cast:</p>',
    '<p>3/day each: <em>fireball</em>, <em>haste</em></p>',
  ].join(''),
  actionsDescription: [
    '<p><em><strong>Fire Breath (Recharge 5–6).</strong></em> The dragon exhales fire in a 60-foot cone.</p>',
    '<p><em><strong>Wing Gust (Recharge after a Short or Long Rest).</strong></em> Whoosh.</p>',
  ].join(''),
  legendaryActionsDescription:
    '<p>The dragon can take 3 legendary actions, choosing from the options below.</p><p><strong>Detect.</strong> The dragon makes a Wisdom (Perception) check.</p>',
};
