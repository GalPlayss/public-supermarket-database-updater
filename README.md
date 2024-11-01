### This a public project, (the private one runs on a vercel server). To run this code locally you'll need to change/replicate the handler function call
### also you will need to put your firebase key in the firebase_key.json, and your database URL in update-store-database.js.

# The main function

#### The code is used to update the supermarket database with:
* each store name, location, and brand
* each item with prices from every supermarket
* the amount of items
* the amount of stores
* the time in which the database updated

#### The supermarket included in this project are:

Shufersal deal, Shufersal sheli, Shufersal Yesh hesed, Tiv taam, Rami Levi, Hazi Hinam, Stop market, Osherad, and am:pm


# How does the code work?
The main script is update-store-database.js. 

First, It imports the manager script and database managing libraries. 

In the main function, the script calls manager.downloadStores and includes a parameter of all the supermarkets but Shufersal.
#### inside the downloadStores function
Now the code splits into 2 parts

That's because all the supermarkets but shufersal use a file sharing platform called Cerberus, while Shufersal uses their custom website.

The code adds a promise of downloderCerberus.download() to an array for all the supermarkets but Shufersal, with a supermarket name parameter. 
Then, the code adds at the start of the array promises to downloaderShufersal.download()

## How does downloading the data work?

### Download from cerberus:
First, the function creates a cookie jar, and a client which will be needed later in the code.

Then, the code calls a function getFileList, which takes the username parameter, the client, and the cookiejar.

Now, to get the data from the website, you will need to log in with the username parametr, and an empty password.
To do that, the code generates a CSRF token, then sends a post request to log in with the credentials and the token, using the client so the cookie will be saved at the cookiejar.

After the login, the code sends a post request to the website, with the cookie as a header, and returnds the response (all the needed files).

After getting the files, the code filters out files and returns only the largest prices file, and the file with the location of the stores.
Then the code downloads the stores file (an XML file), and extracts the prices file (a gunzip file), and returns both.

### Download from shufersal:
First, the code requests the HTML content from shufersal's website (using a get request), and extracts the link to the stores file.

Then, the code gets an id of each branch of Shufersal (Deal, Sheli, Yesh hesed).

With the id, the extracts from the website a download link for each the 3 files.

After that it downloads all 3 files at the same time (using Promise.all), extract them, and returns them

## back to the manager script
After all of the files are downloaded and extracted, the code splits the xml array into an array for prices, and an array for stores.

After that the code calls the xmlHandler.combineStores, and xmlHandler.combinePrices which combines all the stores and prices XMLs respectively into a readable and arranged XML string.

And the code returns the arranged xmls to the main function, and the main function updates the database with this data.
