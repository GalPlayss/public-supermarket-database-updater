import * as xml2js from "xml2js";

const parser = new xml2js.Parser();

export async function combineStores(xmlStrings) {
    let combinedStores = [];
    let counter = 0;
    for (let { stores, brand, _ } of xmlStrings) {
        const result = await parser.parseStringPromise(stores);
        brand = brand.replace("doralon", "am:pm");

        if (
            result.Root &&
            result.Root.SubChains &&
            result.Root.SubChains[0] &&
            result.Root.SubChains[0].SubChain
        ) {
            const stores = result.Root.SubChains[0].SubChain[0].Stores[0].Store;

            for (let store of stores) {
                const address = store.Address[0];
                const storeName = store.StoreName[0];

                if (brand == "am:pm" && !storeName.includes("Am-pm")) {
                    continue;
                }

                if (
                    address !== "unknown" &&
                    !storeName.includes("וולט") &&
                    !address.includes("www.") &&
                    !storeName.includes("מחסן") &&
                    address != "קיבוץ"
                ) {
                    const store1 = {
                        address: address,
                        city: store.City[0],
                        brand: brand,
                    };

                    combinedStores.push(store1);

                    counter++;
                }
            }
        } else {
            const stores = result["asx:abap"]["asx:values"][0].STORES[0].STORE;

            const exclude = [
                "Be",
                "שופרסל אקספרס",
                "שופרסל דיל אקסטרא",
                null,
                NaN,
            ];
            for (let store of stores) {
                const type = store.SUBCHAINNAME[0];

                if (exclude.every((branch) => type != branch)) {
                    const store1 = {
                        address: store.ADDRESS[0],
                        city: store.CITY[0],
                        brand: type,
                    };
                    combinedStores.push(store1);

                    counter++;
                }
            }
        }
    }

    return [combinedStores, counter];
}


function combineSameNames(prices){ // eg. מלפפון in 2 brands have different item codes (rare)
    let names = {}

    let codesToDelete = []

    for(const [code, info] of Object.entries(prices)){
        if(names[info.name] && (prices[names[info.name]].weighted === 1 || prices[names[info.name]].quantity == info.quantity)){ // already something with the same name
            prices[names[info.name]].prices = prices[names[info.name]].prices.concat(info.prices)
            codesToDelete.push(code)
        }else{
            names[info.name] = code;
        }
    }

    for(const code of codesToDelete){
        delete prices[code];
    }

    console.log("----------------------------");
    for(const [code, info] of Object.entries(prices)){ //remove duplicate brands of the same item
        const mostExpensivePrices = {};

        for (const price of info.prices) {
          const brand = price.brand;
          const priceValue = parseFloat(price.price);
      
          if (!mostExpensivePrices[brand] || priceValue > mostExpensivePrices[brand].price) {
            mostExpensivePrices[brand] = price; // Store the entire price object
          }
        }
        info.prices = Object.values(mostExpensivePrices);
    }

    return prices;
}

function longest(str1, str2){
    return str1.length > str2.length ? str1 : str2 
}

const exclude = ["אביזרים לבית", "קופון ציפר"] // סופרים עושים שטויות
export async function combinePrices(xmlStrings) {
    let combinedPrices = [];
    for (let {xml, brand} of xmlStrings) {
        let items = await parser.parseStringPromise(xml)  // XML => Object.

        if(items.Root != undefined){ // some supers do Root and some root
            items = items.Root.Items[0].Item; 
        }else{
            items = items.root.Items[0].Item; 
        }
        console.log(brand)

        for(let item of items){
            const itemData = {
                "code":item.ItemCode[0].trim(), 
                "name":longest(item.ManufacturerItemDescription[0].trim(), item.ItemName[0].trim()),
                "weighted":parseInt(item.bIsWeighted[0].trim()),
                "measurementUnit":item.UnitOfMeasure[0].trim(), 
                "quantity":parseInt(item.Quantity[0].trim()), 
                "price": parseFloat(item.bIsWeighted[0] === 0 ? item.UnitOfMeasurePrice[0] : item.ItemPrice[0]),
            }   
            if(combinedPrices[itemData.code] && exclude.every(name => itemData.name !== name)){ // if the item was already added by a previous supermarket
                combinedPrices[itemData.code].prices.push({"brand":brand, "price":itemData.price}) // add to the prices
            }else if(exclude.every(name => itemData.name !== name)){ 
                combinedPrices[itemData.code] ={
                    "name":itemData.name,
                    "weighted":itemData.weighted,
                    "quantity":itemData.quantity,
                    "measurementUnit":itemData.measurementUnit,
                    "prices":[{"brand":brand, "price":itemData.price}],
                }
            }
        }
    }
    console.log("ITEM COUNTER: " + Object.keys(combinedPrices).length)
    combinedPrices = combineSameNames(combinedPrices)
    console.log("ITEM COUNTER AFTER COMBINING: " + Object.keys(combinedPrices).length)

    return [combinedPrices, Object.keys(combinedPrices).length];
}
