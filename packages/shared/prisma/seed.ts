import { PrismaClient } from '../src/generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create games
  const overwatch = await prisma.game.upsert({
    where: { id: 'overwatch' },
    update: {},
    create: {
      id: 'overwatch',
      name: 'overwatch',
      displayName: 'Overwatch 2',
      isActive: true,
    },
  });

  const marvelRivals = await prisma.game.upsert({
    where: { id: 'marvel-rivals' },
    update: {},
    create: {
      id: 'marvel-rivals',
      name: 'marvel-rivals',
      displayName: 'Marvel Rivals',
      isActive: true,
    },
  });

  // Overwatch Characters
  const overwatchCharacters = [
    // Tank
    { name: 'dva', displayName: 'D.Va', role: 'Tank' },
    { name: 'junker-queen', displayName: 'Junker Queen', role: 'Tank' },
    { name: 'orisa', displayName: 'Orisa', role: 'Tank' },
    { name: 'reinhardt', displayName: 'Reinhardt', role: 'Tank' },
    { name: 'roadhog', displayName: 'Roadhog', role: 'Tank' },
    { name: 'sigma', displayName: 'Sigma', role: 'Tank' },
    { name: 'winston', displayName: 'Winston', role: 'Tank' },
    { name: 'wrecking-ball', displayName: 'Wrecking Ball', role: 'Tank' },
    { name: 'zarya', displayName: 'Zarya', role: 'Tank' },
    // DPS
    { name: 'ashe', displayName: 'Ashe', role: 'DPS' },
    { name: 'bastion', displayName: 'Bastion', role: 'DPS' },
    { name: 'cassidy', displayName: 'Cassidy', role: 'DPS' },
    { name: 'echo', displayName: 'Echo', role: 'DPS' },
    { name: 'genji', displayName: 'Genji', role: 'DPS' },
    { name: 'hanzo', displayName: 'Hanzo', role: 'DPS' },
    { name: 'junkrat', displayName: 'Junkrat', role: 'DPS' },
    { name: 'mei', displayName: 'Mei', role: 'DPS' },
    { name: 'pharah', displayName: 'Pharah', role: 'DPS' },
    { name: 'reaper', displayName: 'Reaper', role: 'DPS' },
    { name: 'soldier-76', displayName: 'Soldier: 76', role: 'DPS' },
    { name: 'sombra', displayName: 'Sombra', role: 'DPS' },
    { name: 'symmetra', displayName: 'Symmetra', role: 'DPS' },
    { name: 'torbjorn', displayName: 'Torbjörn', role: 'DPS' },
    { name: 'tracer', displayName: 'Tracer', role: 'DPS' },
    { name: 'widowmaker', displayName: 'Widowmaker', role: 'DPS' },
    // Support
    { name: 'ana', displayName: 'Ana', role: 'Support' },
    { name: 'baptiste', displayName: 'Baptiste', role: 'Support' },
    { name: 'brigitte', displayName: 'Brigitte', role: 'Support' },
    { name: 'kiriko', displayName: 'Kiriko', role: 'Support' },
    { name: 'lucio', displayName: 'Lúcio', role: 'Support' },
    { name: 'mercy', displayName: 'Mercy', role: 'Support' },
    { name: 'moira', displayName: 'Moira', role: 'Support' },
    { name: 'zenyatta', displayName: 'Zenyatta', role: 'Support' },
  ];

  for (const char of overwatchCharacters) {
    await prisma.character.upsert({
      where: { gameId_name: { gameId: 'overwatch', name: char.name } },
      update: {},
      create: {
        gameId: 'overwatch',
        name: char.name,
        displayName: char.displayName,
        role: char.role,
      },
    });
  }

  // Marvel Rivals Characters
  const marvelRivalsCharacters = [
    // Vanguard (Tank)
    { name: 'captain-america', displayName: 'Captain America', role: 'Vanguard' },
    { name: 'doctor-strange', displayName: 'Doctor Strange', role: 'Vanguard' },
    { name: 'groot', displayName: 'Groot', role: 'Vanguard' },
    { name: 'hulk', displayName: 'Hulk', role: 'Vanguard' },
    { name: 'magneto', displayName: 'Magneto', role: 'Vanguard' },
    { name: 'peni-parker', displayName: 'Peni Parker', role: 'Vanguard' },
    { name: 'thor', displayName: 'Thor', role: 'Vanguard' },
    { name: 'venom', displayName: 'Venom', role: 'Vanguard' },
    // Duelist (DPS)
    { name: 'black-panther', displayName: 'Black Panther', role: 'Duelist' },
    { name: 'black-widow', displayName: 'Black Widow', role: 'Duelist' },
    { name: 'hawkeye', displayName: 'Hawkeye', role: 'Duelist' },
    { name: 'hela', displayName: 'Hela', role: 'Duelist' },
    { name: 'iron-man', displayName: 'Iron Man', role: 'Duelist' },
    { name: 'magik', displayName: 'Magik', role: 'Duelist' },
    { name: 'namor', displayName: 'Namor', role: 'Duelist' },
    { name: 'psylocke', displayName: 'Psylocke', role: 'Duelist' },
    { name: 'punisher', displayName: 'Punisher', role: 'Duelist' },
    { name: 'scarlet-witch', displayName: 'Scarlet Witch', role: 'Duelist' },
    { name: 'spider-man', displayName: 'Spider-Man', role: 'Duelist' },
    { name: 'squirrel-girl', displayName: 'Squirrel Girl', role: 'Duelist' },
    { name: 'star-lord', displayName: 'Star-Lord', role: 'Duelist' },
    { name: 'storm', displayName: 'Storm', role: 'Duelist' },
    { name: 'winter-soldier', displayName: 'Winter Soldier', role: 'Duelist' },
    { name: 'wolverine', displayName: 'Wolverine', role: 'Duelist' },
    // Strategist (Support)
    { name: 'adam-warlock', displayName: 'Adam Warlock', role: 'Strategist' },
    { name: 'cloak-and-dagger', displayName: 'Cloak & Dagger', role: 'Strategist' },
    { name: 'jeff-the-land-shark', displayName: 'Jeff the Land Shark', role: 'Strategist' },
    { name: 'loki', displayName: 'Loki', role: 'Strategist' },
    { name: 'luna-snow', displayName: 'Luna Snow', role: 'Strategist' },
    { name: 'mantis', displayName: 'Mantis', role: 'Strategist' },
    { name: 'rocket-raccoon', displayName: 'Rocket Raccoon', role: 'Strategist' },
  ];

  for (const char of marvelRivalsCharacters) {
    await prisma.character.upsert({
      where: { gameId_name: { gameId: 'marvel-rivals', name: char.name } },
      update: {},
      create: {
        gameId: 'marvel-rivals',
        name: char.name,
        displayName: char.displayName,
        role: char.role,
      },
    });
  }

  // Overwatch Maps
  const overwatchMaps = [
    { name: 'hanamura', displayName: 'Hanamura', mapType: 'Assault' },
    { name: 'temple-of-anubis', displayName: 'Temple of Anubis', mapType: 'Assault' },
    { name: 'volskaya', displayName: 'Volskaya Industries', mapType: 'Assault' },
    { name: 'dorado', displayName: 'Dorado', mapType: 'Escort' },
    { name: 'junkertown', displayName: 'Junkertown', mapType: 'Escort' },
    { name: 'route-66', displayName: 'Route 66', mapType: 'Escort' },
    { name: 'gibraltar', displayName: 'Watchpoint: Gibraltar', mapType: 'Escort' },
    { name: 'eichenwalde', displayName: 'Eichenwalde', mapType: 'Hybrid' },
    { name: 'hollywood', displayName: 'Hollywood', mapType: 'Hybrid' },
    { name: 'kings-row', displayName: "King's Row", mapType: 'Hybrid' },
    { name: 'numbani', displayName: 'Numbani', mapType: 'Hybrid' },
    { name: 'ilios', displayName: 'Ilios', mapType: 'Control' },
    { name: 'lijiang', displayName: 'Lijiang Tower', mapType: 'Control' },
    { name: 'nepal', displayName: 'Nepal', mapType: 'Control' },
    { name: 'oasis', displayName: 'Oasis', mapType: 'Control' },
  ];

  for (const map of overwatchMaps) {
    await prisma.map.upsert({
      where: { gameId_name: { gameId: 'overwatch', name: map.name } },
      update: {},
      create: {
        gameId: 'overwatch',
        name: map.name,
        displayName: map.displayName,
        mapType: map.mapType,
      },
    });
  }

  // Marvel Rivals Maps (sample - adjust based on actual game)
  const marvelRivalsMaps = [
    { name: 'tokyo-2099', displayName: 'Tokyo 2099', mapType: 'Convoy' },
    { name: 'yggsgard', displayName: 'Yggsgard: Royal Palace', mapType: 'Convoy' },
    { name: 'tokyo-2099-city', displayName: 'Tokyo 2099: Shin-Shibuya', mapType: 'Domination' },
    { name: 'asgard', displayName: 'Asgard', mapType: 'Domination' },
  ];

  for (const map of marvelRivalsMaps) {
    await prisma.map.upsert({
      where: { gameId_name: { gameId: 'marvel-rivals', name: map.name } },
      update: {},
      create: {
        gameId: 'marvel-rivals',
        name: map.name,
        displayName: map.displayName,
        mapType: map.mapType,
      },
    });
  }

  // Game Modes
  const overwatchModes = [
    { name: 'quickplay', displayName: 'Quick Play' },
    { name: 'competitive', displayName: 'Competitive' },
    { name: 'arcade', displayName: 'Arcade' },
    { name: 'custom', displayName: 'Custom Games' },
  ];

  for (const mode of overwatchModes) {
    await prisma.gameMode.upsert({
      where: { gameId_name: { gameId: 'overwatch', name: mode.name } },
      update: {},
      create: {
        gameId: 'overwatch',
        name: mode.name,
        displayName: mode.displayName,
      },
    });
  }

  const marvelRivalsModes = [
    { name: 'quickmatch', displayName: 'Quick Match' },
    { name: 'competitive', displayName: 'Competitive' },
    { name: 'customs', displayName: 'Custom Games' },
  ];

  for (const mode of marvelRivalsModes) {
    await prisma.gameMode.upsert({
      where: { gameId_name: { gameId: 'marvel-rivals', name: mode.name } },
      update: {},
      create: {
        gameId: 'marvel-rivals',
        name: mode.name,
        displayName: mode.displayName,
      },
    });
  }

  console.log('Database seeded successfully!');
  console.log(`Created games: ${overwatch.displayName}, ${marvelRivals.displayName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 