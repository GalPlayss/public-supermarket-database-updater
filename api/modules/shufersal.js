// imports
import axios from "axios";
import zlib from "zlib";
import cheerio from "cheerio";

// constants
const URL = "https://prices.shufersal.co.il";
const STORE_URL = URL + "/FileObject/UpdateCategory?catID=5&storeId=0"
const PRICES_URL = URL + "/FileObject/UpdateCategory?catID=2&storeId="

// function that downloads the needed file (.gz compressed), extracts it, and returns it as a string 
const downloadAndExtract = async (downloadUrl) => {
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

// get the download link for the store file
const getStoreLink = async () => {
    try {
        const response = await axios.get(STORE_URL);
        const html = response.data;

        const $ = cheerio.load(html); // Parse the HTML

        const storeLink = $('a[href*="Stores"]').attr("href"); // Extract the link from the parsed html

        if (storeLink) {
            console.log("Store link:", storeLink);
            return storeLink;
        } else {
            console.error('Could not find the store link for shugersal');
        }
    } catch (error) {
        console.error("Error fetching HTML:", error);
    }
}

// get a store ID for each branch of shufersal 
const getBranches = async () => {
    const branches = ["", "", ""]; // id of stores - format => [deal, sheli, yesh hesed]

    const response = await axios.get(URL);

    const $ = cheerio.load(response.data);

    // a dropdown of the branches
    const selectElement = $("#ddlStore").find("option");

    // loop on the droplist until an ID found for each branch
    for (const option of selectElement.toArray()) {
        const branch = $(option).text().trim().split(" ") // format of id - name, before split

        const id = branch[0];
        const name = branch[2]; 

        if (name === "דיל" && branches[0] === "") {
            branches[0] = id;
        } else if (name === "שלי" && branches[1] === "") {
            branches[1] = id;
        } else if (name === "יש" && branches[2] === "") {
            branches[2] = id;
        }

        if (branches.every((branch) => branch !== "")) {
            return branches;
        }
    }
    return branches;
}

// get the download link for prices XML file, for the given ID
const getPricesLink = async (storeId) => {
    const response = await axios.get(PRICES_URL + storeId);
    const $ = cheerio.load(response.data);

    return $('a[href*="PriceFull"]').attr("href"); // Extract the link from html data
}

const brands = ["stores", "שופרסל דיל", "שופרסל שלי", "יש חסד"] // all the type of brands, order is necessary.

// main function which downloads the store data for all shufersal branches
const shufersalDownload = async () => {
    // get all the branch ids
    const branches = await getBranches();

    // [stores, deal prices, sheli prices, yesh hesed prices]
    const links = [getStoreLink(), ...branches.map((id) => getPricesLink(id))] 

    const downloadedFiles = await Promise.all(links);

    // get the xml for each of the links and return it.
    const formatPromises = downloadedFiles.map((link, i) => 
        downloadAndExtract(link).then((resultXml) => 
            ({
                xml: resultXml, 
                brand: brands[i]
            })
        )
    );

    const formatted = await Promise.all(formatPromises)

    return formatted;
}

export default shufersalDownload