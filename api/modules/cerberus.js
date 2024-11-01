// imports
import axios from "axios";
import * as tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import iconv from "iconv-lite";
import { Transform } from "stream";
import zlib from "zlib";

// constants
const URL = "https://url.publishedprices.co.il"; // base url for cerberus
const FILE_URL = URL +  "/file/d/"; // base url for cerberus
const LOGIN_URL = URL + "/login/user";
const JSON_URL = URL + "/file/json/dir";
const TOKEN_PATTERN = '<meta name="csrftoken" content="(.*?)"/>'; // used to extract token from website
const PATTERN_REGEXT = new RegExp(TOKEN_PATTERN);

// Function to get CSRF token
const getToken = async (client) => {
    try {
        const response = await client.get(URL, {
            headers: {
                "Accept": "text/html,application/xhtml+xml",
                "Content-Type": "text/html; charset=utf-8",
            },
        });

        if (response.status !== 200) {
            throw new Error(`HTTP status is not ok. Status: ${response.status}`);
        }

        // Extract the token using regular expressions
        const match = response.data.match(PATTERN_REGEXT);
        if (match && match[1]) {
            return match[1];
        } else {
            throw new Error("Token not found");
        }
    } catch (error) {
        console.error("Error while getting a token:", error);
    }
}

const fileListRequest = async (token, cookieJar) => {
    try {
        const data = new URLSearchParams({
            iDisplayLength: "100000", // display all the entries
            csrftoken: token,
        }).toString();

        const cookie = await cookieJar.getCookieString(URL)
        const response = await axios.post(
            JSON_URL,
            data,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie,
                },
                withCredentials: true,
            }
        );

        return response.data.aaData; // the list of files
    } catch (error) {
        console.error("Error while making the request for the files list:", error);
    }
}

// Function to perform login
const login = async(username, csrftoken, client) => {
    try {
        const data = new URLSearchParams({
            "username": username,
            "password": "",
            "csrftoken": csrftoken,
        });

        const response = await client.post(LOGIN_URL, data.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": "https://url.publishedprices.co.il/login?r=%2Ffile",
                "Origin": "https://url.publishedprices.co.il",
            },
            maxRedirects: 0,
            validateStatus: (status) => {
                return status >= 200 && status < 400; // Resolve only if there is no error
            },
        });

        if (response.status === 302) {
            return response; //success
        }
    } catch (error) {
        console.error("Error in login:", error);
    }
}

// function that gets the list of all the supermarket data files
const getFileList = async (username, client, cookieJar) => {
    const token = await getToken(client);

    // perform the login
    await login(username, token, client);

    // token changes after login, need to get the new one
    const tokenAfterLogin = await getToken(client);

    const fileList = await fileListRequest(
        tokenAfterLogin,
        cookieJar
    );

    return fileList;
}

// download xml files (store files)
const downloadXML = async (fileName, client, encoding) => {
    try {
        const response = await client.get(FILE_URL + fileName, {
            responseType: "stream", // Get the response as a binary buffer
        });

        const decoder = iconv.decodeStream(encoding);

        // Decode the response based on detected encoding
        const formatter = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk.toString()); // Format XML in chunks
                callback();
            },
        });
        // Pipe response data through the decoder and then through the formatter
        const xmlStream = response.data.pipe(decoder).pipe(formatter);

        // Collect the formatted XML into a single string
        let xmlContent = "";
        xmlStream.on("data", (chunk) => {
            xmlContent += chunk;
        });

        return new Promise((resolve, reject) => {
            xmlStream.on("end", () => resolve(xmlContent));
            xmlStream.on("error", reject);
        });
    } catch (error) {
        console.error("Error downloading the file:", error);
    }
}

// download and extracts files with .gz compression (price files)
const downloadGZ = async (fileName, client) => {
    const response = await client.get(FILE_URL + fileName, {
        responseType: "stream",
    });

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

// download all the needed store files (Store files are XML format)
const downloadStoreFile = async (fileNames, client, encoding) => {
    // loop from the last to the first, break when there is a result (last = latest)
    for (let i = fileNames.length - 1; i >= 0; i--) {
        const XML = await downloadXML(fileNames[i], client, encoding);

        if (XML !== "") { // sometimes xml can be empty
            return XML.toString()
        }
    }

    console.error(`Could not download stores XML file: ${fileNames[0]}`)
    return "<Root></Root>"; // so it won't break other parts of the code
}

// download all the needed prices files (Price files are XML format)
const downloadPricesFile = async (fileName, client) => {
    const XML = await downloadGZ(fileName, client);

    if (XML !== "") { // sometimes xml can be empty
        return XML.toString()
    }

    console.error(`Could not download prices XML file: ${fileName}`)
    return "<Root></Root>"; // so it won't break other parts of the code
}

// Function to filter only the needed files, from all the stores data
// rules: push all store files, and push the biggest prices
const filterNeededFiles = (fileList) => {
    const files = {
        Stores: [],
        PriceFull: null,
    };

    for(const file of fileList){
        if (file.name.startsWith("Stores")) {
            files.Stores.push(file.name);
        } else if (file.name.startsWith("PriceFull")) {
            files.PriceFull = (files.PriceFull == null || files.PriceFull.size < file.size) ? file.name : files.PriceFull;
        }
    };

    return files;
}

// the main function, receives a username, and download Store and PriceFull files of the supermarket with that username on Cerberus.
// returns in format [storesXML, pricesXML]
const cerberusDownload = async (username) => {
    const cookieJar = new tough.CookieJar();
    const client = wrapper(
        axios.create({
            "jar": cookieJar,
            "withCredentials": true,
            "keepAlive": true,
        })
    );

    const fileList = await getFileList(username, client, cookieJar);

    const files = filterNeededFiles(fileList);

    const storesXML = downloadStoreFile(files.Stores, client, "UTF-16LE");
    const pricesXML = downloadPricesFile(files.PriceFull, client);
    const result = await Promise.all([storesXML, pricesXML]);

    return result
};

export default cerberusDownload