// imports
import * as xml2js from "xml2js";

const parser = new xml2js.Parser();

// format an XML of store data from cerberus
const handleCerberus = async (parsedXML, brand) => {
    const combined = [];
    let counter = 0;

    // extract the stores array
    const stores = parsedXML.Root.SubChains[0].SubChain[0].Stores[0].Store;

    for (const store of stores) {
        const address = store.Address[0];
        const storeName = store.StoreName[0];

        // if the brand is doralon, but not am:pm, skip it
        if (brand === "am:pm" && !storeName.includes("Am-pm")) {
            continue;
        }

        // check for validity, if valid, format and insert into the array
        const isValid =
            address !== "unknown" && // no address
            address !== "קיבוץ" && // no address
            !address.includes("www.") && // online store
            !storeName.includes("וולט") && // only digital shopping
            !storeName.includes("מחסן"); // a warehouse

        if (!isValid) continue;

        const formattedStore = {
            address: address,
            city: store.City[0],
            brand: brand,
        };

        combined.push(formattedStore);
        counter++;
    }

    return [combined, counter];
};

// format an XML of store data from shufersal
const handleShufersal = async (parsedXML) => {
    const combined = [];
    let counter = 0;

    // extract the stores array
    const stores = parsedXML["asx:abap"]["asx:values"][0].STORES[0].STORE;

    // branches that are not physical supermarkets
    const exclude = ["Be", "שופרסל אקספרס", "שופרסל דיל אקסטרא", null, NaN];

    for (const store of stores) {
        const type = store.SUBCHAINNAME[0];

        // check for validity, if valid, format and insert into the array
        const isValid = !exclude.includes(type);
        if (!isValid) {
            continue;
        }

        const formattedStore = {
            address: store.ADDRESS[0],
            city: store.CITY[0],
            brand: type,
        };

        combined.push(formattedStore);
        counter++;
    }
    return [combined, counter];
};

// combine and format the stores xml of all the stores
const combineStores = async (storesData) => {
    let counter = 0;

    const combinedPromises = storesData.map(async (data) => {
        const [storesXML, brand] = data;

        const parsedXML = await parser.parseStringPromise(storesXML); // XML => Object.

        // Check if cerberus, the files have a different format
        const isCerberus = parsedXML?.Root?.SubChains?.[0]?.SubChain;

        const result = isCerberus
            ? await handleCerberus(parsedXML, brand)
            : await handleShufersal(parsedXML);

        counter += result[1]; // Update the counter
        return result[0]; // Return the combined XML
    });

    const combinedStores = await Promise.all(combinedPromises);
    const storesUnpacked = combinedStores.flat()

    return [storesUnpacked, counter];
};

const combineSameNames = (prices) => {
    // eg. מלפפון in 2 brands have different item codes (rare)
    let names = {};

    let codesToDelete = [];

    for (const [code, info] of Object.entries(prices)) {
        if (
            names[info.name] &&
            (prices[names[info.name]].weighted === 1 ||
                prices[names[info.name]].quantity === info.quantity)
        ) {
            // already something with the same name
            prices[names[info.name]].prices = prices[
                names[info.name]
            ].prices.concat(info.prices);
            codesToDelete.push(code);
        } else {
            names[info.name] = code;
        }
    }

    for (const code of codesToDelete) {
        delete prices[code];
    }

    console.log("----------------------------");
    for (const [code, info] of Object.entries(prices)) {
        //remove duplicate brands of the same item
        const mostExpensivePrices = {};

        for (const price of info.prices) {
            const brand = price.brand;
            const priceValue = parseFloat(price.price);

            if (
                !mostExpensivePrices[brand] ||
                priceValue > mostExpensivePrices[brand].price
            ) {
                mostExpensivePrices[brand] = price; // Store the entire price object
            }
        }
        info.prices = Object.values(mostExpensivePrices);
    }

    return prices;
};

// get the longest of 2 strings
const longest = (str1, str2) => (str1.length > str2.length ? str1 : str2);

// receive an item that was parsed from XML, format it to a more readable data
const formatItem = (item) => {
    const {
        ItemCode,
        ManufacturerItemDescription,
        ItemName,
        bIsWeighted,
        UnitOfMeasure,
        Quantity,
        ManufacturerName,
        UnitOfMeasurePrice,
        ItemPrice,
    } = item;

    return {
        "code": ItemCode[0].trim(),
        "name": longest(
            ManufacturerItemDescription[0].trim(),
            ItemName[0].trim()
        ),
        "weighted": parseInt(bIsWeighted[0].trim()),
        "measurementUnit": UnitOfMeasure[0].trim(),
        "quantity": parseInt(Quantity[0].trim()),
        "ManufacturerName": ManufacturerName[0].trim(),
        "price": parseFloat(
            bIsWeighted[0] === 0 ? UnitOfMeasurePrice[0] : ItemPrice[0]
        ),
    };
};

const excludedItems = ["אביזרים לבית", "קופון ציפר"]; // Some supermarket has tens of those values, probably a mistake.

// get an item that was parsed from xml, check for validity and duplicates, and return the updated result
const handleItem = (item, brand, currentData) => {
    const itemData = formatItem(item);

    const isValid = !excludedItems.includes(itemData.name);

    if (!isValid) {
        return false;
    }

    const wasAdded = currentData !== undefined;

    if (wasAdded) {
        currentData.prices.push({
            "brand": brand,
            "price": itemData.price,
        });
        return currentData;
    }

    const { price, ...dataWithoutPrice } = itemData;
    const newData = {
        ...dataWithoutPrice, 
        "prices": [{ 
            "brand": brand, 
            "price": itemData.price 
        }]
    }
    return newData;
}

// combine and format the prices xml of all the stores
const combinePrices = async (xmlStrings) => {
    const combinedPrices = [];
    for (const { xml, brand } of xmlStrings) {
        const parsedXML = await parser.parseStringPromise(xml); // XML => Object.

        // some supermarket's xml use Root and some use root
        const items = parsedXML.Root?.Items[0]?.Item || parsedXML.root?.Items[0]?.Item;

        for (const item of items) {
            combinedPrices[item.ItemCode[0].trim()] = handleItem(item, brand, combinedPrices[item.ItemCode[0].trim()])
        }
    }
    // combinedPrices = combineSameNames(combinedPrices);

    const itemCounter = Object.keys(combinedPrices).length

    return [combinedPrices, itemCounter];
};

export { combineStores, combinePrices };
