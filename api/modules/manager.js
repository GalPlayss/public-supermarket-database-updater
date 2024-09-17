import * as downloader from './downloaderCerberus';
import * as downloaderShufersal from './downloaderShufersal';
import * as xmlHandler from './xmlHandler';

export async function downloadStores(usernames){
    console.log(usernames)
    let downloadPromises = usernames.map(username => downloader.download(username).then(xml => ({ stores: xml[0], brand: username, prices: {xml:xml[1], brand: username }})));
    downloadPromises.unshift(downloaderShufersal.download().then(xml => ({stores: xml[0].xml, brand:"shufersal", prices:xml.slice(1)})))

    let xmlStrings = await Promise.all(downloadPromises);

    let prices = []
    for(let data of xmlStrings){
        if(Array.isArray(data.prices)){ // shufersal
            for(let priceInfo of data.prices){
                prices.push(priceInfo)
            }
        }else{
            prices.push(data.prices)
        }
    }
    console.log("PRICES: " + xmlStrings)
    
    let combinerPromise = [xmlHandler.combineStores(xmlStrings), xmlHandler.combinePrices(prices)]

    return await Promise.all(combinerPromise);
}
