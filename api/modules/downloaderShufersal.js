import axios from "axios";
import zlib from "zlib";
import cheerio from "cheerio";

async function downloadAndExtract(downloadUrl) {
    const response = await axios.get(downloadUrl, { responseType: "stream" });

    if (response.status !== 200) {
        throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = [];
    for await (const chunk of response.data) {
        buffer.push(chunk);
    }

    const zippedData = Buffer.concat(buffer);

    try {
        const unzippedData = zlib.gunzipSync(zippedData);

        return unzippedData.toString();
    } catch (error) {
        console.error("Error during extraction:", error);
    }
}

async function getStoreLink() {
    try {
        let url =
            "https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=5&storeId=0";
        const response = await axios.get(url);
        const html = response.data;

        const $ = cheerio.load(html); // Parse the HTML

        const storeLink = $('a[href*="Stores"]').attr("href"); // Extract the link

        if (storeLink) {
            console.log("Store link:", storeLink);
            return storeLink;
        } else {
            console.log('No link found starting with "Stores"');
        }
    } catch (error) {
        console.error("Error fetching HTML:", error);
    }
}

async function getBranches() {
    let branches = [0, 0, 0]; // id of stores - format => [deal, sheli, yesh hesed]

    let url = "https://prices.shufersal.co.il";
    let response = await axios.get(url);

    const $ = cheerio.load(response.data);

    //רשימה של כל הסניפים
    const selectElement = $("#ddlStore").find("option");

    for (let option of selectElement.toArray()) {
        let branchId = $(option).text().trim().split(" ")[0]; // extrach the branch from text
        let branch = $(option).text().trim().split(" ")[2]; // extrach the branch from text

        if (branch == "דיל" && branches[0] === 0) {
            branches[0] = branchId;
            if (branches.every((branch) => branch !== 0)) {
                return branches;
            }
        } else if (branch == "שלי" && branches[1] === 0) {
            branches[1] = branchId;
            if (branches.every((branch) => branch !== 0)) {
                console.log("Returned here??");
                return branches;
            }
        } else if (branch == "יש" && branches[2] === 0) {
            branches[2] = branchId;
            if (branches.every((branch) => branch !== 0)) {
                return branches;
            }
        }
    }
    return branches;
}

async function getPricesLink(storeId) {
    let url = "https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=" + storeId;

    let response = await axios.get(url);
    const $ = cheerio.load(response.data);

    return $('a[href*="PriceFull"]').attr("href"); // Extract the link
}

const brands = ["stores", "שופרסל דיל", "שופרסל שלי", "יש חסד"]

export async function download() {
    let links = [getStoreLink()]; // [stores, deal prices, sheli prices, yesh hesed prices]
    let branches = await getBranches();
    for (let id of branches) {
        links.push(getPricesLink(id));
    }
    links = await Promise.all(links);
    console.log(links);

    let xmls = [];

    for (let i = 0; i < links.length; i++) {
        xmls.push(downloadAndExtract(links[i]).then(resultXml => ({xml: resultXml, brand:brands[i]})));
    }

    xmls = await Promise.all(xmls)

    return xmls;
}