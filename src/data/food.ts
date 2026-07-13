// Food imagery for the "Big Combo" build-your-combo showcase on the home page.
// Files live under public/images/food/<category>/. Edit here to add/remove items.
//
// Each item carries two labels for two different audiences:
//   • name — the short, clean label the customer SEES beneath the image.
//   • alt  — the descriptive image alt text for SEO and screen readers (not
//            shown on screen). Keep it keyword-rich and natural.

export type FoodImage = { src: string; name: string; alt: string };

export const entrees: FoodImage[] = [
  { src: "/images/food/entree/jpsSandwich.jpg", name: "JP's Sandwich", alt: "JP's Nashville hot chicken sandwich" },
  { src: "/images/food/entree/chickenAndWaffles.jpg", name: "Chicken & Waffles", alt: "Nashville hot chicken and waffles" },
  { src: "/images/food/entree/wholeWings.jpg", name: "Whole Wings", alt: "Nashville hot wings" },
  { src: "/images/food/entree/Wings NonBreaded.jpg", name: "Wings", alt: "hot chicken wings" },
  { src: "/images/food/entree/chickenBurrito.jpg", name: "JPs Burrito", alt: "hot chicken burrito" },
  { src: "/images/food/entree/catfish.jpg", name: "Catfish", alt: "Southern fried catfish" },
];

export const sides: FoodImage[] = [
  { src: "/images/food/sides/fries.jpg", name: "Fries", alt: "Seasoned french fries" },
  { src: "/images/food/sides/cajunFries.jpg", name: "Cajun Fries", alt: "Hot fries" },
  { src: "/images/food/sides/macAndCheese.jpg", name: "Mac & Cheese", alt: "Creamy mac and cheese" },
  { src: "/images/food/sides/coleslaw.jpg", name: "Coleslaw", alt: "Southern style coleslaw" },
  { src: "/images/food/sides/bakedBeans.jpg", name: "Baked Beans", alt: "Baked beans" },
  { src: "/images/food/sides/friedPickles.jpg", name: "Fried Pickles", alt: "Fried dill pickles" },
  { src: "/images/food/sides/friedOkra.jpg", name: "Fried Okra", alt: "Southern fried okra" },
  { src: "/images/food/sides/JalapenoPoppersNew.jpg", name: "Jalapeño Poppers", alt: "Jalapeño poppers" },
  { src: "/images/food/sides/biscuit.jpg", name: "Biscuit", alt: "Buttermilk biscuit" },
];

export const dippingSauces: FoodImage[] = [
  { src: "/images/food/dippingSauce/JPsSauce_edited.jpg", name: "JP's Sauce", alt: "JP's signature dipping sauce" },
  { src: "/images/food/dippingSauce/ranch_edited.jpg", name: "Ranch", alt: "Ranch dipping sauce" },
  { src: "/images/food/dippingSauce/BBQSauce_edited.jpg", name: "BBQ", alt: "BBQ dipping sauce" },
  { src: "/images/food/dippingSauce/BuffaloSauce_edited.jpg", name: "Buffalo", alt: "Buffalo dipping sauce" },
  { src: "/images/food/dippingSauce/HoneyMustard_edited.jpg", name: "Honey Mustard", alt: "Honey mustard dipping sauce" },
  { src: "/images/food/dippingSauce/HotHoney_edited.jpg", name: "Hot Honey", alt: "Hot honey dipping sauce" },
  { src: "/images/food/dippingSauce/HotSauce_edited_edited_edited.jpg", name: "Hot Sauce", alt: "Nashville hot sauce" },
  { src: "/images/food/dippingSauce/tarterSauce_edited.jpg", name: "Tartar", alt: "Tartar dipping sauce" },
  { src: "/images/food/dippingSauce/syrup_edited.jpg", name: "Syrup", alt: "Maple syrup" },
];

export const drinks: FoodImage[] = [
  { src: "/images/food/drinks/Coke.jpg", name: "Coke", alt: "Coca-Cola" },
  { src: "/images/food/drinks/dietCoke.jpg", name: "Diet Coke", alt: "Diet Coke" },
  { src: "/images/food/drinks/cokeZero.jpg", name: "Coke Zero", alt: "Coca-Cola Zero Sugar" },
  { src: "/images/food/drinks/sprite.jpg", name: "Sprite", alt: "Sprite" },
  { src: "/images/food/drinks/fruitPunch.jpg", name: "Fruit Punch", alt: "Fruit punch" },
  { src: "/images/food/drinks/sweetTea.jpg", name: "Sweet Tea", alt: "Southern sweet tea" },
];

// Full combo plates for the home-page photo gallery. These are the frame-free
// crops (the originals in ../ have a decorative black border baked in).
export const combos: FoodImage[] = [
  { src: "/images/food/combos/cropped/chickenSandwichCombo.png", name: "JP'sSandwich Combo", alt: "Nashville hot chicken sandwich combo" },
  { src: "/images/food/combos/cropped/chickenWafflesCombo.png", name: "Chicken and Waffles Combo", alt: "Hot chicken and waffles combo" },
  { src: "/images/food/combos/cropped/wholeWingsCombo.png", name: "Whole Wings Combo", alt: "Whole hot chicken wings combo" },
  { src: "/images/food/combos/cropped/partyWingsCombo.png", name: "Wings Combo", alt: "Party wings combo" },
  { src: "/images/food/combos/cropped/jumboTendersCombo.png", name: "Jumbo Tenders Combo", alt: "Jumbo hot chicken tenders combo" },
  { src: "/images/food/combos/cropped/chickenBitesCombo.png", name: "Chicken Bites Combo", alt: "Hot chicken bites combo" },
  { src: "/images/food/combos/cropped/breastQuarterCombo.png", name: "Breast Quarter Combo", alt: "Hot chicken breast quarter combo" },
  { src: "/images/food/combos/cropped/legQuarterCombo.png", name: "Leg Quarter Combo", alt: "Hot chicken leg quarter combo" },
  { src: "/images/food/combos/cropped/burritoCombo.png", name: "JP's Burrito Combo", alt: "Hot chicken burrito combo" },
  { src: "/images/food/combos/cropped/shrimpBurritoCombo.png", name: "Shrimp Burrito Combo", alt: "Shrimp burrito combo" },
  { src: "/images/food/combos/cropped/shrimpBitesCombo.png", name: "Shrimp Bites Combo", alt: "Fried shrimp bites combo" },
  { src: "/images/food/combos/cropped/catfishCombo.png", name: "Catfish Combo", alt: "Fried catfish combo" },
];
