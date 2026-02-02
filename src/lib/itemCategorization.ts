// Smart item categorization based on common grocery/retail apps (Walmart, Instacart, Costco patterns)

export type ItemCategory = 
  | 'produce'
  | 'meat_seafood'
  | 'dairy_eggs'
  | 'bakery'
  | 'beverages'
  | 'snacks'
  | 'frozen'
  | 'pantry'
  | 'deli_prepared'
  | 'household'
  | 'personal_care'
  | 'health_wellness'
  | 'baby'
  | 'pet'
  | 'automotive'
  | 'electronics'
  | 'office'
  | 'clothing'
  | 'home_garden'
  | 'sports_outdoors'
  | 'other';

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  produce: 'Produce',
  meat_seafood: 'Meat & Seafood',
  dairy_eggs: 'Dairy & Eggs',
  bakery: 'Bakery',
  beverages: 'Beverages',
  snacks: 'Snacks & Candy',
  frozen: 'Frozen',
  pantry: 'Pantry & Canned',
  deli_prepared: 'Deli & Prepared',
  household: 'Household',
  personal_care: 'Personal Care',
  health_wellness: 'Health & Wellness',
  baby: 'Baby',
  pet: 'Pet Supplies',
  automotive: 'Automotive',
  electronics: 'Electronics',
  office: 'Office & School',
  clothing: 'Clothing',
  home_garden: 'Home & Garden',
  sports_outdoors: 'Sports & Outdoors',
  other: 'Other',
};

export const ITEM_CATEGORY_ICONS: Record<ItemCategory, string> = {
  produce: '🥬',
  meat_seafood: '🥩',
  dairy_eggs: '🥛',
  bakery: '🍞',
  beverages: '🥤',
  snacks: '🍪',
  frozen: '🧊',
  pantry: '🥫',
  deli_prepared: '🥗',
  household: '🧹',
  personal_care: '🧴',
  health_wellness: '💊',
  baby: '🍼',
  pet: '🐾',
  automotive: '🚗',
  electronics: '📱',
  office: '📎',
  clothing: '👕',
  home_garden: '🏡',
  sports_outdoors: '⚽',
  other: '📦',
};

// Keyword patterns for categorization (case-insensitive) - expanded based on major retailers
const CATEGORY_PATTERNS: Record<ItemCategory, RegExp[]> = {
  produce: [
    /banana|apple|orange|lemon|lime|grape|berry|berries|strawberr|blueberr|raspberr|blackberr|melon|watermelon|cantaloupe|honeydew|mango|pineapple|peach|pear|plum|cherry|cherries|kiwi|avocado|tomato|papaya|coconut|fig|date|pomegranate|grapefruit|tangerine|clementine|mandarin|nectarine/i,
    /lettuce|spinach|kale|arugula|cabbage|broccoli|cauliflower|carrot|celery|cucumber|pepper|bell pepper|jalapeno|onion|garlic|shallot|leek|potato|sweet potato|yam|corn|bean|pea|mushroom|zucchini|squash|eggplant|asparagus|artichoke|beet|radish|turnip|parsnip|rutabaga/i,
    /salad|fruit|vegetable|veg|produce|organic|fresh|green|herb|cilantro|parsley|basil|mint|dill|rosemary|thyme|oregano|chive|scallion|ginger|turmeric/i,
    /sprout|bok choy|napa|swiss chard|collard|mustard green|dandelion|endive|radicchio|fennel|kohlrabi|jicama|plantain|starfruit|dragon fruit|lychee|passion fruit|guava|persimmon/i,
  ],
  meat_seafood: [
    /chicken|beef|pork|lamb|turkey|duck|goose|veal|venison|bison|rabbit|steak|ground|meat|sausage|bacon|ham|deli meat|salami|pepperoni|hot dog|hotdog|bratwurst|kielbasa|chorizo|prosciutto/i,
    /fish|salmon|tuna|shrimp|prawn|crab|lobster|seafood|tilapia|cod|halibut|trout|bass|perch|catfish|mahi|snapper|swordfish|oyster|mussel|clam|scallop|calamari|squid|octopus|anchov|sardine|mackerel|herring/i,
    /ribeye|sirloin|tenderloin|filet|flank|brisket|roast|chop|cutlet|patty|meatball|meatloaf|liver|tongue|oxtail|bone.?in|bone.?less|wing|thigh|breast|drumstick|leg quarter/i,
  ],
  dairy_eggs: [
    /milk|cream|half.?half|cheese|butter|margarine|yogurt|yoghurt|cottage|ricotta|mozzarella|cheddar|parmesan|swiss|brie|feta|gouda|provolone|havarti|muenster|colby|jack|american cheese|cream cheese|goat cheese|blue cheese/i,
    /egg|eggs|dozen|omelette|quiche/i,
    /sour cream|whipping cream|heavy cream|whipped cream|clotted cream|creme fraiche|dairy|lactose|almond milk|oat milk|soy milk|coconut milk|cashew milk|rice milk/i,
    /kefir|buttermilk|condensed milk|evaporated milk|powdered milk|ghee|custard|pudding/i,
  ],
  bakery: [
    /bread|loaf|bun|roll|bagel|croissant|muffin|donut|doughnut|cake|pie|pastry|cookie|biscuit|cracker|scone|danish|strudel|eclair|macaron|brownie|cupcake|tart|cobbler/i,
    /bakery|baked|flour|wheat|sourdough|rye|multigrain|whole grain|artisan|ciabatta|focaccia|brioche|pita|naan|tortilla|wrap|flatbread|cornbread/i,
    /cinnamon roll|sticky bun|french bread|italian bread|pumpernickel|pretzel|breadstick/i,
  ],
  beverages: [
    /water|sparkling|perrier|evian|dasani|aquafina|spring water|mineral water|seltzer|la croix|bubly|topo chico/i,
    /soda|pop|cola|coke|pepsi|sprite|fanta|7.?up|dr.?pepper|mountain dew|ginger ale|root beer|cream soda|orange crush/i,
    /juice|orange juice|apple juice|grape juice|cranberry|grapefruit juice|pineapple juice|tomato juice|vegetable juice|v8|lemonade|limeade|iced tea|sweet tea|arnold palmer/i,
    /coffee|espresso|latte|cappuccino|starbucks|tim hortons|dunkin|keurig|nespresso|k.?cup|cold brew|instant coffee|decaf/i,
    /tea|green tea|black tea|herbal|chamomile|peppermint tea|earl grey|chai|matcha|oolong/i,
    /beer|wine|liquor|vodka|whiskey|whisky|bourbon|scotch|rum|gin|tequila|brandy|cognac|alcohol|spirits|champagne|prosecco|sake|cider|mead|vermouth|liqueur/i,
    /energy drink|red bull|monster|rockstar|bang|reign|gatorade|powerade|vitamin water|body armor|drink|beverage|smoothie|shake|milkshake/i,
  ],
  snacks: [
    /chip|chips|crisp|popcorn|pretzel|cracker|nachos|tortilla chip|corn chip|potato chip|pita chip|veggie chip|kettle/i,
    /candy|chocolate|gum|mint|snickers|mars|kit.?kat|reese|m&m|skittles|starburst|twix|milky way|butterfinger|sour patch|swedish fish|gummy|gummies|licorice|caramel|toffee|fudge|truffle/i,
    /cookie|oreo|chips ahoy|nutter butter|fig newton|granola|bar|protein bar|energy bar|clif|kind bar|larabar|rx bar|quest|nut|almond|cashew|peanut|walnut|pistachio|pecan|macadamia|hazelnut|mixed nut/i,
    /snack|trail mix|jerky|beef jerky|turkey jerky|fruit snack|fruit leather|dried fruit|raisin|craisin|date|rice cake|cheese puff|cheeto|dorito|frito|bugles|combos|goldfish|cheez.?it/i,
    /sunflower seed|pumpkin seed|seed|nut butter|nutella/i,
  ],
  frozen: [
    /frozen|freeze|freezer|frost|icy/i,
    /ice cream|gelato|sorbet|sherbet|frozen yogurt|popsicle|fudgsicle|creamsicle|ice pop|frozen bar|drumstick|klondike|haagen|ben.?jerry/i,
    /frozen pizza|frozen meal|tv dinner|lean cuisine|stouffers|marie callender|healthy choice|hungry man|banquet|frozen vegetable|frozen fruit|frozen entre|frozen breakfast|frozen burrito|frozen chicken|frozen fish|frozen shrimp/i,
    /waffle frozen|pancake frozen|frozen hash|tater tot|french fry|frozen fry|egg roll|spring roll|frozen dumpling|frozen pie|frozen cake|frozen bread|cool whip/i,
  ],
  pantry: [
    /can|canned|soup|broth|stock|bouillon|tomato sauce|pasta sauce|marinara|alfredo|pesto|salsa|enchilada sauce/i,
    /pasta|spaghetti|macaroni|penne|fettuccine|linguine|rigatoni|lasagna|noodle|ramen|udon|rice|basmati|jasmine|arborio|wild rice|quinoa|couscous|grain|barley|bulgur|farro/i,
    /cereal|oatmeal|granola|muesli|cream of wheat|pancake mix|waffle mix|bisquick|syrup|maple syrup|honey|agave|molasses|jam|jelly|preserves|marmalade|peanut butter|almond butter|spread/i,
    /oil|olive oil|vegetable oil|canola|avocado oil|coconut oil|sesame oil|vinegar|balsamic|apple cider vinegar|soy sauce|tamari|teriyaki|worcestershire|fish sauce|hot sauce|sriracha|tabasco|ketchup|mustard|mayo|mayonnaise|relish|pickle|sauce|dressing|ranch|italian dressing|caesar|thousand island/i,
    /spice|salt|pepper|cinnamon|paprika|oregano|cumin|chili powder|cayenne|turmeric|curry|garlic powder|onion powder|seasoning|mrs dash|old bay|italian seasoning|taco seasoning|bay leaf|nutmeg|allspice|clove|cardamom|coriander|ginger powder/i,
    /sugar|brown sugar|powdered sugar|flour|all purpose|bread flour|baking|yeast|baking soda|baking powder|cornstarch|corn meal|cocoa|vanilla|extract|food coloring/i,
    /bean|lentil|chickpea|kidney bean|black bean|pinto|navy bean|cannellini|split pea|dried bean|hummus/i,
    /nut|almond|peanut|cashew|walnut|pecan|pistachio|macadamia|hazelnut|coconut shred|dried fruit|raisin|craisin|apricot dried|mango dried|date/i,
  ],
  deli_prepared: [
    /deli|rotisserie|prepared|ready to eat|ready.?made|pre.?made|pre.?cooked|grab.?and.?go/i,
    /sandwich|sub|hoagie|wrap|panini|salad bar|soup bar|hot bar|cold bar/i,
    /fried chicken|chicken tenders|chicken strips|chicken wings|buffalo wings|potato salad|macaroni salad|coleslaw|cole slaw|deviled egg|antipasto|olive bar|cheese platter|fruit platter|veggie tray|party tray/i,
    /sushi|sashimi|poke|spring roll|egg roll|california roll|chef salad|cobb salad|caesar salad/i,
    /sliced meat|sliced cheese|deli meat|deli cheese|lunch meat|cold cut|roast beef|turkey breast|ham slice|pastrami|corned beef|bologna|salami slice/i,
  ],
  household: [
    /paper towel|toilet paper|tissue|kleenex|napkin|facial tissue|paper plate|paper cup|paper bowl|plastic cup|plastic plate|plastic utensil/i,
    /cleaner|cleaning|detergent|laundry|dish soap|dishwasher|bleach|lysol|clorox|windex|pledge|swiffer|mr clean|pine.?sol|oxiclean|tide|downy|fabric softener|dryer sheet|stain remover/i,
    /trash bag|garbage bag|hefty|glad|zip.?loc|ziploc|sandwich bag|freezer bag|storage bag|foil|aluminum|plastic wrap|saran|parchment|wax paper|cling wrap/i,
    /light bulb|battery|batteries|duracell|energizer|extension|cord|plug|adapter|flashlight|candle|match|lighter/i,
    /sponge|scrubber|brush|broom|mop|bucket|dustpan|vacuum|duster|glove|rubber glove/i,
    /air freshener|febreze|glade|odor|deodorizer|spray/i,
  ],
  personal_care: [
    /shampoo|conditioner|soap|body wash|bar soap|hand soap|lotion|body lotion|moisturizer|deodorant|antiperspirant|old spice|dove|axe|degree/i,
    /toothpaste|toothbrush|floss|mouthwash|dental|oral|listerine|crest|colgate|sensodyne/i,
    /razor|shave|shaving|cream|gel|aftershave|gillette|schick/i,
    /makeup|cosmetic|lipstick|lip gloss|mascara|foundation|concealer|blush|eyeshadow|eyeliner|brow|nail polish|remover|makeup remover|wipe|cotton ball|cotton swab|q.?tip/i,
    /sunscreen|sunblock|spf|moisturizer|face wash|facial|cleanser|toner|serum|anti.?aging|wrinkle|acne|exfoliat/i,
    /hair spray|hair gel|mousse|styling|hair color|dye|perm|relaxer|hair oil|leave.?in|detangler/i,
    /feminine|tampon|pad|pantiliner|menstrual|sanitary|kotex|always|playtex/i,
  ],
  health_wellness: [
    /vitamin|supplement|multivitamin|vitamin c|vitamin d|vitamin b|iron|calcium|magnesium|zinc|fish oil|omega|probiotic|prebiotic|fiber supplement/i,
    /medicine|medication|drug|pharmaceutical|prescription|otc|over.?the.?counter/i,
    /pain relief|tylenol|advil|ibuprofen|aspirin|acetaminophen|aleve|naproxen|excedrin|motrin/i,
    /cold medicine|flu|cough|throat|lozenge|halls|ricola|nyquil|dayquil|mucinex|robitussin|sudafed|zyrtec|claritin|allegra|benadryl|antihistamine|allergy/i,
    /bandage|band.?aid|gauze|first aid|antiseptic|neosporin|hydrogen peroxide|rubbing alcohol|thermometer|heating pad|ice pack/i,
    /antacid|tums|pepto|pepto.?bismol|imodium|laxative|fiber|metamucil|miralax|digestive/i,
    /sleep aid|melatonin|unisom|zzquil|eye drop|visine|contact lens|saline|nasal spray|afrin|flonase/i,
  ],
  baby: [
    /baby|infant|toddler|newborn|child|kid/i,
    /diaper|huggies|pampers|luvs|pull.?up|training pant|wipe|baby wipe|wet wipe/i,
    /formula|baby food|gerber|beech.?nut|happy baby|earth.?s best|puffs baby|teether|bib/i,
    /pacifier|bottle|sippy|nipple|breast pump|nursing/i,
    /baby shampoo|baby lotion|baby oil|baby powder|diaper cream|desitin|butt paste|baby wash/i,
    /stroller|car seat|crib|bassinet|playpen|bouncer|swing|high chair/i,
  ],
  pet: [
    /pet|dog|cat|puppy|kitten|canine|feline|bird|fish pet|hamster|guinea pig|rabbit pet|reptile|turtle|snake/i,
    /pet food|dog food|cat food|puppy food|kitten food|wet food|dry food|kibble|purina|pedigree|iams|blue buffalo|royal canin|hills|science diet|meow mix|friskies|fancy feast|alpo|beneful/i,
    /treat|dog treat|cat treat|milk bone|greenies|dentastix|temptations/i,
    /litter|cat litter|kitty litter|tidy cat|fresh step|arm.?hammer litter|scoop|clumping/i,
    /leash|collar|harness|cage|crate|kennel|bed pet|dog bed|cat bed|toy pet|chew toy|ball pet|scratching post|flea|tick|heartworm|frontline|advantix/i,
  ],
  automotive: [
    /oil|motor oil|synthetic|5w|10w|transmission fluid|brake fluid|power steering|coolant|antifreeze|windshield|wiper|wiper blade/i,
    /gasoline|gas|fuel|diesel|petrol|premium|unleaded|e85/i,
    /car wash|car wax|polish|detailing|tire|tyre|air freshener car|little tree|armor all/i,
    /spark plug|air filter|oil filter|headlight|tail light|bulb auto|fuse|jump|battery car|jumper cable|ice scraper|snow brush/i,
  ],
  electronics: [
    /phone|charger|charging cable|lightning|usb|usb.?c|micro usb|hdmi|adapter|power bank|portable charger/i,
    /headphone|earbud|airpod|bluetooth|speaker|soundbar|wireless/i,
    /computer|laptop|tablet|ipad|keyboard|mouse|monitor|printer|ink|cartridge|toner|paper computer/i,
    /tv|television|remote|roku|fire.?stick|chromecast|streaming|gaming|xbox|playstation|nintendo|switch|controller/i,
    /camera|memory card|sd card|flash drive|usb drive|hard drive|ssd/i,
    /smart|alexa|google home|nest|ring|doorbell|thermostat|wifi|router|modem|cable/i,
  ],
  office: [
    /pen|pencil|marker|highlighter|sharpie|expo|dry erase/i,
    /paper|copy paper|printer paper|notebook|notepad|legal pad|journal|composition|loose leaf/i,
    /folder|binder|divider|tab|file|filing|organizer|desk organizer/i,
    /stapler|staple|paper clip|binder clip|push pin|thumb tack|rubber band/i,
    /tape|scotch|masking tape|packing tape|duct tape|scissors|glue|glue stick|elmers|adhesive/i,
    /envelope|stamp|shipping|label|post.?it|sticky note|index card|flash card/i,
    /calendar|planner|agenda|schedule|whiteboard|cork board|bulletin/i,
    /calculator|ruler|protractor|compass|eraser|correction|white.?out/i,
    /backpack|lunch box|lunch bag|school supply|crayon|colored pencil|watercolor|paint/i,
  ],
  clothing: [
    /shirt|t.?shirt|tee|polo|blouse|top|tank top|camisole|sweater|sweatshirt|hoodie|cardigan|pullover/i,
    /pants|jeans|denim|shorts|capri|legging|jogger|sweatpant|khaki|chino|trouser|slacks/i,
    /dress|skirt|romper|jumpsuit|bodysuit/i,
    /jacket|coat|blazer|vest|parka|windbreaker|raincoat|poncho|fleece/i,
    /sock|ankle sock|crew sock|knee high|stocking|tight|underwear|boxer|brief|panty|bra|sports bra|lingerie|shapewear/i,
    /shoe|sneaker|boot|sandal|slipper|flip flop|heel|flat|loafer|oxford|dress shoe|athletic shoe|running shoe/i,
    /hat|cap|beanie|scarf|glove|mitten|belt|tie|bow tie|suspender|wallet|purse|handbag|backpack clothing/i,
    /pajama|pj|nightgown|robe|bathrobe|sleepwear|loungewear/i,
  ],
  home_garden: [
    /plant|flower|seed|bulb|pot|planter|soil|potting|fertilizer|mulch|garden|gardening/i,
    /tool garden|shovel|rake|hoe|trowel|pruner|shear|hedge|lawn|mower|trimmer|edger|sprinkler|hose|nozzle/i,
    /furniture|chair|table|couch|sofa|bed frame|mattress|pillow|blanket|sheet|bedding|comforter|duvet|curtain|drape|blind|shade/i,
    /rug|carpet|mat|door mat|bath mat|towel|bath towel|hand towel|washcloth/i,
    /decor|decoration|frame|picture|art|mirror|vase|lamp|light fixture|ceiling fan/i,
    /kitchen|cookware|pot|pan|skillet|baking|dish|plate|bowl|cup|mug|glass|utensil|spatula|spoon|fork|knife kitchen|cutting board|mixing bowl|storage container|tupperware/i,
    /appliance|blender|mixer|toaster|microwave|coffee maker|slow cooker|instant pot|air fryer|food processor/i,
    /outdoor|patio|grill|bbq|barbecue|charcoal|propane|deck|umbrella patio|cushion outdoor/i,
  ],
  sports_outdoors: [
    /sport|athletic|fitness|workout|exercise|gym|training/i,
    /ball|basketball|football|soccer|baseball|softball|tennis|golf|volleyball|bowling/i,
    /bike|bicycle|cycling|helmet|skateboard|scooter|roller|skate/i,
    /camping|tent|sleeping bag|cooler|lantern|flashlight outdoor|compass|binocular|backpack outdoor|hiking|trail/i,
    /fishing|rod|reel|tackle|bait|lure|hook fishing/i,
    /hunting|camo|camouflage|blind|decoy|ammunition|ammo/i,
    /swimming|pool|goggles|swimsuit|float|raft|kayak|canoe|paddle/i,
    /yoga|mat yoga|resistance band|dumbbell|weight|kettlebell|jump rope|foam roller/i,
    /water bottle sport|shaker|cooler bag|sports bag|duffel/i,
  ],
  other: [],
};

/**
 * Normalize a name for comparison (removes case, extra spaces, punctuation variations)
 */
export function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[''`]/g, "'") // Normalize quotes
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse spaces
    .replace(/\b(the|and|or|of|at|in|on|for|to|a|an)\b/g, '') // Remove articles
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get a display name from normalized key - pick the most complete version
 */
export function getBestDisplayName(names: string[]): string {
  if (names.length === 0) return 'Unknown';
  // Pick the longest name (usually most complete) and clean it
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const best = sorted[0];
  // Title case it
  return best
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Categorizes an item based on its name using pattern matching
 */
export function categorizeItem(itemName: string): ItemCategory {
  const name = itemName.toLowerCase().trim();
  
  // Check each category's patterns
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (category === 'other') continue;
    
    for (const pattern of patterns) {
      if (pattern.test(name)) {
        return category as ItemCategory;
      }
    }
  }
  
  return 'other';
}

/**
 * Clean up messy item names from OCR
 */
export function cleanItemName(rawName: string): string {
  let name = rawName.trim();
  
  // Remove common OCR artifacts
  name = name.replace(/^[\d\s\-\.]+/, ''); // Remove leading numbers/dots
  name = name.replace(/[\d\s\-\.]+$/, ''); // Remove trailing numbers/dots
  name = name.replace(/\s{2,}/g, ' '); // Collapse multiple spaces
  
  // Remove UPC/SKU patterns
  name = name.replace(/\b\d{6,}\b/g, ''); // Remove long number sequences
  name = name.replace(/\b[A-Z]{2,}\d{3,}\b/gi, ''); // Remove SKU patterns like AB123
  
  // Remove common receipt abbreviations and prefixes
  name = name.replace(/^(item|itm|prd|prod|sku|qty)\s*/i, '');
  
  // Clean up
  name = name.trim();
  
  // If name is too short or generic, return a better fallback
  if (name.length < 2 || /^(item|product|misc|other|\?+|\-+)$/i.test(name)) {
    return 'Unknown Item';
  }
  
  // Capitalize first letter of each word
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface CategorizedItem {
  name: string;
  cleanName: string;
  category: ItemCategory;
  categoryLabel: string;
  categoryIcon: string;
  quantity: number;
  unit: string;
  price: number;
  store: string;
  date: string;
}

/**
 * Parse and categorize items from expense notes
 */
export function parseAndCategorizeItems(
  notes: string,
  store: string,
  date: string
): CategorizedItem[] {
  const items: CategorizedItem[] = [];
  const lines = notes.split('\n');
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Pattern 1: "Item Name (x2) - $5.99" (count-based items)
    const countMatch = trimmedLine.match(/^(.+?)\s*\(x(\d+(?:\.\d+)?)\)\s*-\s*\$?([\d.]+)/i);
    if (countMatch) {
      const [, rawName, qty, price] = countMatch;
      const cleanName = cleanItemName(rawName);
      const category = categorizeItem(cleanName);
      
      items.push({
        name: rawName.trim(),
        cleanName,
        category,
        categoryLabel: ITEM_CATEGORY_LABELS[category],
        categoryIcon: ITEM_CATEGORY_ICONS[category],
        quantity: parseFloat(qty) || 1,
        unit: 'ea',
        price: parseFloat(price) || 0,
        store,
        date,
      });
      return;
    }
    
    // Pattern 2: "Item Name (1.5 kg) - $3.50" (weight/volume-based items)
    const weightMatch = trimmedLine.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\s*(kg|g|lb|oz|L|ml|ea|each|pc|pcs)\)\s*-\s*\$?([\d.]+)/i);
    if (weightMatch) {
      const [, rawName, qty, unit, price] = weightMatch;
      const cleanName = cleanItemName(rawName);
      const category = categorizeItem(cleanName);
      
      items.push({
        name: rawName.trim(),
        cleanName,
        category,
        categoryLabel: ITEM_CATEGORY_LABELS[category],
        categoryIcon: ITEM_CATEGORY_ICONS[category],
        quantity: parseFloat(qty) || 1,
        unit: unit.toLowerCase(),
        price: parseFloat(price) || 0,
        store,
        date,
      });
      return;
    }
    
    // Pattern 3: Simple "Item Name - $5.99" format (single item, no quantity shown)
    const simpleMatch = trimmedLine.match(/^(.+?)\s*-\s*\$?([\d.]+)$/);
    if (simpleMatch) {
      const [, rawName, price] = simpleMatch;
      const cleanName = cleanItemName(rawName);
      const category = categorizeItem(cleanName);
      
      items.push({
        name: rawName.trim(),
        cleanName,
        category,
        categoryLabel: ITEM_CATEGORY_LABELS[category],
        categoryIcon: ITEM_CATEGORY_ICONS[category],
        quantity: 1,
        unit: 'ea',
        price: parseFloat(price) || 0,
        store,
        date,
      });
    }
  });
  
  return items;
}
