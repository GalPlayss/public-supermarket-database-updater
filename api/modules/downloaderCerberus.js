// libraries
import axios from 'axios';
import * as tough from 'tough-cookie'; 
import { wrapper } from 'axios-cookiejar-support';
import iconv from 'iconv-lite';
import { Transform } from 'stream';
import zlib from 'zlib'; 

const url = "https://url.publishedprices.co.il"; // base url for cerberus 
const loginUrl = "https://url.publishedprices.co.il/login/user";
const patternRegex = '<meta name="csrftoken" content="(.*?)"/>'; // used to extract token from website

// Function to get CSRF token
async function getToken(client) {
    try {
        const response = await client.get(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml",
                "Content-Type": "text/html; charset=utf-8",
            },
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Extract the token using regular expressions
        const match = response.data.match(new RegExp(patternRegex));
        if (match && match[1]) {
            return match[1];
        } else {
            throw new Error("Token not found");
        }
    } catch (error) {
        console.error("Error in getToken:", error);
    }
}


async function fileListRequest(token, cookieJar) {
    try {
        const data = new URLSearchParams({
            iDisplayLength: "100000", // display all the entries
            csrftoken: token,
        }).toString();
        
        const response = await axios.post(
            "https://url.publishedprices.co.il/file/json/dir",
            data,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: await cookieJar.getCookieString(url),
                },
                withCredentials: true,
            }
        );

        return response.data.aaData; // the list of files
    } catch (error) {
        console.error("Error in makePostRequest:", error);
    }
}

// Function to perform login
async function login(username, password, csrftoken, client) {
    try {
        const data = new URLSearchParams({
            username: username,
            password: password,
            csrftoken: csrftoken,
        });

        const response = await client.post(loginUrl, data.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: "https://url.publishedprices.co.il/login?r=%2Ffile",
                Origin: "https://url.publishedprices.co.il",
            },
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Resolve only if the status code is less than 400
            },
        });

        if (response.status === 302) {
            return response; //success
        }
    } catch (error) {
        console.error("Error in login:", error);
    }
}

// token changes after login, so need to exctract it from the page
async function getCsrfTokenFromPage(client) {
    try {
        const response = await client.get(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml",
                "Content-Type": "text/html; charset=utf-8",
            },
        });

        if (response.status !== 200) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Extract CSRF token from meta tag
        const match = response.data.match(patternRegex);
        if (match && match[1]) {
            return match[1]; // Return the CSRF token
        } else {
            throw new Error("CSRF token not found in page");
        }
    } catch (error) {
        console.error("Error in getCsrfTokenFromPage:", error);
    }
}


async function getFileList(username, client,cookieJar) {
    let token = await getToken(client);

    await login(username, "", token, client);

    let fileList = fileListRequest(await getCsrfTokenFromPage(client), cookieJar);
    return fileList;
}
async function downloadXML(fileUrl, client, encoding) {
    try {
        const response = await client.get(url + "/file/d/" + fileUrl, {
          responseType: 'stream', // Get the response as a binary buffer
        });
    
        const decoder = iconv.decodeStream(encoding);

        // Decode the response based on detected encoding
        const formatter = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk.toString()); // Format XML in chunks
                callback();
            }
        });
        // Pipe response data through the decoder and then through the formatter
        const xmlStream = response.data.pipe(decoder).pipe(formatter);

        // Collect the formatted XML into a single string
        let xmlContent = '';
        xmlStream.on('data', chunk => {
            xmlContent += chunk;
        });
        xmlStream.on('end', () => {});

        return new Promise((resolve, reject) => {
            xmlStream.on('end', () => resolve(xmlContent));
            xmlStream.on('error', reject);
        });
    } catch (error) {
      console.error('Error downloading the file:', error);
    }
  }
  
  

function getRequiredFiles(fileList) {
    const files = {
        Stores: [],
        PriceFull: null,
    };

    fileList.forEach((element) => {
        if (element.name.startsWith("Stores")) {
            files.Stores.push(element);
        } else if (element.name.startsWith("PriceFull")) {
            if (files.PriceFull == null) {
                files.PriceFull = element;
            } else if (files.PriceFull.size < element.size) {
                files.PriceFull = [element];
            }
        }
    });

    return files;
}

async function downloadAndExtract(fileUrl, client) {
    const response = await client.get(url + "/file/d/" + fileUrl, { responseType: 'stream' });
  
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
      console.error('Error during extraction:', error);
    }
  }
  

async function getXML(urls, client, encoding){
    let XML = ''
    for(let i = urls.length - 1; i >= 0; i--){
        XML = await downloadXML(urls[i].name, client, encoding);
        if(XML != ''){
            break;
        }
    }
    if(XML == ''){
        XML = '<Root></Root>';
    }

    return XML.toString();
}

async function getGZ(urls, client){
    let XML = ''
    for(let i = urls.length - 1; i >= 0; i--){
        XML = await downloadAndExtract(urls[i].name, client);
        if(XML != ''){
            break;
        }
    }
    if(XML == ''){
        XML = '<Root></Root>';
    }

    return XML.toString();
}

export async function download(username) {
    let cookieJar = new tough.CookieJar();
    let client = wrapper(
        axios.create({
            jar: cookieJar,
            withCredentials: true,
            keepAlive: true,
        })
    );
    let fileList = await getFileList(username, client, cookieJar);

    let files = getRequiredFiles(fileList);

    let storesXML = await getXML(files.Stores, client, "UTF-16LE")
    let pricesXML = await getGZ(files.PriceFull, client)        

    return [storesXML, pricesXML]
}


