// imports
import cerberusDownload from "./cerberus.js";
import shufersalDownload from "./shufersal.js";
import * as xmlHandler from "./xmlHandler.js";

// main function
const downloadStores = async (usernames) => {
    // download data for stores that use cerberus
    const cerberusPromises = usernames.map((username) => {
        return cerberusDownload(username) //  returns [stores, prices] for each store
            .then((xml) => ({
                stores: xml[0],
                brand: username.replace("doralon", "am:pm"), // No need for doralon, only am:pm
                prices: {
                    xml: xml[1],
                    brand: username.replace("doralon", "am:pm"),
                },
            }))
            .catch((error) => {
                console.error(`Error downloading data for ${username}:`, error);
                return null; // Return null so the API will handle the rejection
            });
    });

    // download data for shufersal
    // returns ["stores", שופרסל דיל ,שופרסל שלי ,יש חסד] in that order.

    const shufersalPromise = shufersalDownload()
        .then((xml) => ({
            stores: xml[0].xml, // the stores data
            brand: "shufersal",
            prices: xml.slice(1), // all the other prices
        }))
        .catch((error) => {
            console.error(`Error downloading data for Shufersal:`, error);
            return null; // Return null so the API will handle the rejection
        });

    // add the 2 promise arrays, and wait for all of them to resolve
    const downloadPromises = [shufersalPromise, ...cerberusPromises];

    const xmlStrings = await Promise.all(downloadPromises);

    // seperate prices and stores into different arrays
    const prices = [];
    const stores = [];
    for (const data of xmlStrings) {
        console.log(data.brand)
        console.log(data.prices)
        if (Array.isArray(data.prices)) { // Shufersal has all 3 stores in one prices array
            
            prices.concat(data.prices);
        } else {
            prices.push(data.prices);
        }

        stores.push([data.stores, data.brand]);
    }

    // combine the XMLs, format it, and return the response
    const combinedResultPromises = [
        xmlHandler.combineStores(stores),
        xmlHandler.combinePrices(prices),
    ];

    const result = await Promise.all(combinedResultPromises);

    const response = {
        "stores": result[0][0],
        "store-counter": result[0][1],
        "prices": result[1][0],
        "item-counter": result[1][1],
    };

    return response;
};

export { downloadStores };
