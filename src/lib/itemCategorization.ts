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
  | 'household'
  | 'personal_care'
  | 'baby'
  | 'pet'
  | 'automotive'
  | 'electronics'
  | 'office'
  | 'clothing'
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
  household: 'Household',
  personal_care: 'Personal Care',
  baby: 'Baby',
  pet: 'Pet Supplies',
  automotive: 'Automotive',
  electronics: 'Electronics',
  office: 'Office & School',
  clothing: 'Clothing',
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
  household: '🧹',
  personal_care: '🧴',
  baby: '🍼',
  pet: '🐾',
  automotive: '🚗',
  electronics: '📱',
  office: '📎',
  clothing: '👕',
  other: '📦',
};

// Keyword patterns for categorization (case-insensitive)
const CATEGORY_PATTERNS: Record<ItemCategory, RegExp[]> = {
  produce: [
    /banana|apple|orange|lemon|lime|grape|berry|berries|strawberr|blueberr|raspberr|melon|watermelon|mango|pineapple|peach|pear|plum|cherry|kiwi|avocado|tomato/i,
    /lettuce|spinach|kale|cabbage|broccoli|cauliflower|carrot|celery|cucumber|pepper|onion|garlic|potato|sweet potato|corn|bean|pea|mushroom|zucchini|squash/i,
    /salad|fruit|vegetable|veg|produce|organic|fresh|green|herb|cilantro|parsley|basil|mint/i,
  ],
  meat_seafood: [
    /chicken|beef|pork|lamb|turkey|duck|steak|ground|meat|sausage|bacon|ham|deli|salami|pepperoni|hot dog|hotdog/i,
    /fish|salmon|tuna|shrimp|crab|lobster|seafood|tilapia|cod|halibut|trout|oyster|mussel|clam|scallop/i,
  ],
  dairy_eggs: [
    /milk|cream|half.?half|cheese|butter|yogurt|yoghurt|cottage|ricotta|mozzarella|cheddar|parmesan|swiss|brie|feta/i,
    /egg|eggs|dozen|omelette/i,
    /sour cream|whipping cream|heavy cream|ice cream|gelato|dairy/i,
  ],
  bakery: [
    /bread|loaf|bun|roll|bagel|croissant|muffin|donut|doughnut|cake|pie|pastry|cookie|biscuit|cracker/i,
    /bakery|baked|flour|wheat|sourdough|rye|multigrain|whole grain|artisan/i,
  ],
  beverages: [
    /water|sparkling|perrier|evian|dasani|aquafina|spring water/i,
    /soda|pop|cola|coke|pepsi|sprite|fanta|7.?up|dr.?pepper|mountain dew|ginger ale/i,
    /juice|orange juice|apple juice|grape juice|cranberry|lemonade|iced tea|sweet tea/i,
    /coffee|espresso|latte|cappuccino|starbucks|tim hortons|dunkin|keurig|nespresso/i,
    /tea|green tea|black tea|herbal|chamomile/i,
    /beer|wine|liquor|vodka|whiskey|rum|gin|tequila|alcohol|spirits/i,
    /energy drink|red bull|monster|gatorade|powerade|vitamin water|drink|beverage/i,
  ],
  snacks: [
    /chip|chips|crisp|popcorn|pretzel|cracker|nachos|tortilla/i,
    /candy|chocolate|gum|mint|snickers|mars|kit.?kat|reese|m&m|skittles|starburst/i,
    /cookie|oreo|granola|bar|protein bar|nut|almond|cashew|peanut|walnut|pistachio/i,
    /snack|trail mix|jerky|fruit snack|gummy|gummies/i,
  ],
  frozen: [
    /frozen|freeze|ice cream|popsicle|freezer/i,
    /pizza frozen|frozen pizza|frozen meal|tv dinner|frozen vegetable|frozen fruit/i,
  ],
  pantry: [
    /can|canned|soup|broth|stock|tomato sauce|pasta sauce|marinara/i,
    /pasta|spaghetti|macaroni|noodle|rice|quinoa|couscous|grain/i,
    /cereal|oatmeal|granola|pancake|waffle|syrup|honey|jam|jelly|peanut butter/i,
    /oil|olive oil|vegetable oil|canola|vinegar|soy sauce|ketchup|mustard|mayo|mayonnaise|sauce|dressing/i,
    /spice|salt|pepper|cinnamon|paprika|oregano|cumin|seasoning/i,
    /sugar|flour|baking|yeast|baking soda|baking powder/i,
    /bean|lentil|chickpea|kidney|black bean/i,
  ],
  household: [
    /paper towel|toilet paper|tissue|kleenex|napkin/i,
    /cleaner|cleaning|detergent|soap|dish soap|laundry|bleach|lysol|windex|swiffer/i,
    /trash bag|garbage bag|zip.?loc|ziploc|foil|aluminum|plastic wrap|saran/i,
    /light bulb|battery|batteries|extension|cord|plug/i,
  ],
  personal_care: [
    /shampoo|conditioner|soap|body wash|lotion|deodorant|antiperspirant/i,
    /toothpaste|toothbrush|floss|mouthwash|dental|oral/i,
    /razor|shave|shaving|cream|gel/i,
    /makeup|cosmetic|lipstick|mascara|foundation|concealer|blush|eyeshadow/i,
    /vitamin|supplement|medicine|medication|pain relief|tylenol|advil|ibuprofen|aspirin/i,
    /sunscreen|sunblock|spf|moisturizer|face wash|skincare/i,
    /feminine|tampon|pad|pantiliner/i,
  ],
  baby: [
    /baby|infant|toddler|diaper|wipe|formula|baby food|pacifier|bottle|sippy/i,
  ],
  pet: [
    /pet|dog|cat|puppy|kitten|pet food|dog food|cat food|treats|litter|kibble|purina|pedigree|iams/i,
  ],
  automotive: [
    /oil|motor oil|windshield|wiper|coolant|antifreeze|brake|transmission|car wash|air freshener car/i,
    /gasoline|gas|fuel|diesel|petrol/i,
  ],
  electronics: [
    /phone|charger|cable|usb|hdmi|adapter|headphone|earbud|airpod|bluetooth|speaker|battery pack/i,
    /computer|laptop|tablet|ipad|keyboard|mouse|monitor|printer|ink|cartridge/i,
  ],
  office: [
    /pen|pencil|marker|highlighter|paper|notebook|folder|binder|stapler|tape|scissors|glue/i,
    /envelope|stamp|post.?it|sticky note|calendar|planner/i,
  ],
  clothing: [
    /shirt|t.?shirt|pants|jeans|shorts|dress|skirt|jacket|coat|sweater|hoodie/i,
    /sock|underwear|bra|boxers|briefs/i,
    /shoe|sneaker|boot|sandal|slipper/i,
  ],
  other: [],
};

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
