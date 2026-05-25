sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapRequestCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapRequestCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
		},

		_initModel: function () {
			var oDate = new Date();
			
			var oData = {
				requestDate: oDate,
				weighmentSlipNo: "",
				challanDateTime: "",
				vehicleDetails: "",
				collectArea: "",
				remarks: "",
				items: [
					{
						sno: "1",
						type: "",
						description: "",
						quantity: "",
						uom: "KG"
					}
				]
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "scrap");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("scrap");
			var aItems = oModel.getProperty("/items");
			aItems.push({
				sno: String(aItems.length + 1),
				type: "",
				description: "",
				quantity: "",
				uom: "KG"
			});
			oModel.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oModel = this.getView().getModel("scrap");
			var aItems = oModel.getProperty("/items");
			if (aItems.length <= 1) {
				return;
			}
			
			var oContext = oEvent.getSource().getBindingContext("scrap");
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			aItems.splice(iIndex, 1);
			
			// Re-index
			aItems.forEach(function(oItem, idx) {
				oItem.sno = String(idx + 1);
			});
			
			oModel.setProperty("/items", aItems);
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("scrap");
			var oData = oModel.getData();
			
			// Simple Validation
			if (!oData.items || oData.items.length === 0 || !oData.items[0].type) {
				MessageBox.error("Please select a Material Type for item 1.");
				return;
			}

			var fnFormatDate = function (d) {
				if (!d) return "";
				if (typeof d === "string") return d;
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			var oPayload = {
				SalesDocument: oData.saleOrder || "",
				GatePassType: "NRGP",
				RequestDate: fnFormatDate(oData.requestDate),
				SoldToParty: oData.vendor || "",
				CustomerName: oData.vendorName || "",
				City: oData.city || "",
				PostalCode: oData.postalCode || "",
				CustomerGst: oData.vendorGST || "",
				ApprovalReq: "X",
				VehicleNo: oData.vehicleDetails || "",
				WeighmentTicket: oData.weighmentSlipNo || "",
				ChallanDate: oData.challanDateTime || "",
				ScrapArea: oData.collectArea || "",
				Remarks: oData.remarks || "",
				GatePassReqNo: "",
				Message: "",
				ScrapReqItmNav: (oData.items || []).map(function (item, index) {
					var fQty = parseFloat(String(item.quantity).replace(/,/g, '')) || 0;
					return {
						SalesDocument: oData.saleOrder || "",
						GatePassType: "NRGP",
						ItemNo: String((index + 1) * 10).padStart(6, '0'),
						Material: item.type || "",
						MaterialDesc: item.description || "",
						OrderQuantity: fQty.toFixed(3),
						UOM: item.uom || "KG",
						GatePassReqNo: ""
					};
				})
			};

			var oODataModel = this.getOwnerComponent().getModel();

			var fnMockFallback = function () {
				// Generate mock Request ID
				var sRequestId = "REQ-" + Math.floor(Math.random() * 9000 + 1000);
				
				// Save to local storage mock
				var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
				oData.requestId = sRequestId;
				oData.status = "Pending HOD";
				oData.requestDateStr = oData.requestDate.toLocaleDateString("en-GB");
				aMockList.push(oData);
				localStorage.setItem("mockScrapRequests", JSON.stringify(aMockList));
				
				MessageBox.success("Scrap Request " + sRequestId + " created successfully.", {
					onClose: function () {
						this.onNavBack();
					}.bind(this)
				});
			}.bind(this);

			if (oODataModel) {
				sap.ui.core.BusyIndicator.show(0);
				oODataModel.create("/ScrapReqHdrSet", oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						
						var sReqNo = oResponse.GatePassReqNo || "";
						var sMsg = oResponse.Message || "Scrap Request created successfully.";
						var sDisplayMsg = sMsg;
						if (sReqNo && sMsg.indexOf(sReqNo) === -1) {
							sDisplayMsg += "\nRequest Number: " + sReqNo;
						}

						// Save to local storage mock
						var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
						oData.requestId = sReqNo;
						oData.status = "Pending HOD";
						oData.requestDateStr = new Date().toLocaleDateString("en-GB");
						aMockList.push(oData);
						localStorage.setItem("mockScrapRequests", JSON.stringify(aMockList));

						MessageBox.success(sDisplayMsg, {
							onClose: function () {
								this.onNavBack();
							}.bind(this)
						});
					}.bind(this),
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrMsg = "Failed to create Scrap Request.";
						try {
							var oErrBody = JSON.parse(oError.responseText);
							sErrMsg = (oErrBody.error && oErrBody.error.message && oErrBody.error.message.value) ? oErrBody.error.message.value : sErrMsg;
						} catch (e) {}
						MessageBox.error(sErrMsg);
					}
				});
			} else {
				sap.ui.core.BusyIndicator.show(0);
				setTimeout(function() {
					sap.ui.core.BusyIndicator.hide();
					fnMockFallback();
				}.bind(this), 1000);
			}
		},

		_getMockSaleOrders: function () {
			return [
				{
					saleOrder: "SO-9001",
					vehicleDetails: "AP-16-TJ-9876",
					collectArea: "Boiler Area",
					remarks: "MS Scrap plates from unit 2",
					vendor: "V1",
					vendorName: "Sri Manikandan Traders",
					vendorAddress: "Sri Manikandan Traders, No.102, Vridhachalam Main Road,, Neyveli, India, 607802",
					vendorGST: "33ABEFS1534J1ZB",
					items: [
						{
							sno: "1",
							type: "Metal",
							description: "MS Plates Scrap",
							quantity: "500",
							availQty: "500",
							uom: "KG"
						}
					]
				},
				{
					saleOrder: "SO-9002",
					vehicleDetails: "TS-09-UD-5432",
					collectArea: "Transformer Yard",
					remarks: "Used copper wire cables",
					vendor: "V2",
					vendorName: "Metal Scrap Buyers Pvt Ltd",
					vendorAddress: "Metal Scrap Buyers Pvt Ltd, Chennai",
					vendorGST: "33XXXXXXXXXXXXX",
					items: [
						{
							sno: "1",
							type: "Copper",
							description: "Copper Wire Scrap",
							quantity: "250",
							availQty: "250",
							uom: "KG"
						}
					]
				},
				{
					saleOrder: "SO-9003",
					vehicleDetails: "KA-03-ME-4321",
					collectArea: "Store Room 3",
					remarks: "Old lead acid batteries",
					vendor: "V2",
					vendorName: "Metal Scrap Buyers Pvt Ltd",
					vendorAddress: "Metal Scrap Buyers Pvt Ltd, Chennai",
					vendorGST: "33XXXXXXXXXXXXX",
					items: [
						{
							sno: "1",
							type: "Batteries",
							description: "Lead Batteries",
							quantity: "12",
							availQty: "12",
							uom: "MT"
						}
					]
				}
			];
		},

		onSaleOrderValueHelp: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnOpenDialog = function () {
				if (!that._pSaleOrderValueHelp) {
					that._pSaleOrderValueHelp = sap.ui.core.Fragment.load({
						id: that.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.SaleOrderValueHelp",
						controller: that
					}).then(function (oDialog) {
						that.getView().addDependent(oDialog);
						return oDialog;
					});
				}

				that._pSaleOrderValueHelp.then(function (oDialog) {
					oDialog.getBinding("items").filter([]);
					oDialog.open();
				});
			};

			var fnProcessResults = function (aResults) {
				var aMapped = aResults.map(function (item) {
					var aItemsRaw = [];
					if (item.SaleodrItmNav) {
						if (Array.isArray(item.SaleodrItmNav)) {
							aItemsRaw = item.SaleodrItmNav;
						} else if (item.SaleodrItmNav.results && Array.isArray(item.SaleodrItmNav.results)) {
							aItemsRaw = item.SaleodrItmNav.results;
						}
					}

					var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
						var sRawType = subItem.MaterialType || subItem.Type || subItem.Matkl || "";
						var sType = "Metal";
						if (sRawType) {
							var aKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
							var sLower = sRawType.toLowerCase();
							var sFound = aKeys.find(function(k) {
								return k.toLowerCase() === sLower || sLower.indexOf(k.toLowerCase()) !== -1;
							});
							sType = sFound || "Metal";
						}
						
						var sRawUom = (subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "").toUpperCase();
						var sUom = "KG";
						if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
							sUom = "KG";
						} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
							sUom = "L";
						} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
							sUom = "MT";
						}

						return {
							sno: String(idx + 1),
							type: sType,
							description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
							quantity: (subItem.OrderQuantity || "0").toString(),
							availQty: (subItem.OrderQuantity || "0").toString(),
							uom: sUom
						};
					});

					return {
						saleOrder: item.SalesDocument || item.Vbeln || item.SalesOrder || "",
						vehicleDetails: item.VehicleDetails || item.VehicleNo || "",
						collectArea: item.CollectArea || item.StorageLocation || item.Lgort || "",
						remarks: item.Remarks || item.Description || item.HeaderTxt || item.Text || "",
						vendor: item.SoldToParty || item.Customer || item.Kunnr || item.Vendor || "",
						vendorName: item.CustomerName || item.Name1 || item.VendorName || "",
						vendorAddress: item.CustomerAddress || item.Address || item.Street || "",
						vendorGST: item.CustomerGST || item.CustomerGst || item.Gst || item.Stcd3 || "",
						city: item.City || "",
						postalCode: item.PostalCode || "",
						items: aItemsMapped
					};
				});

				that.getView().setModel(new JSONModel({ results: aMapped }), "sos");
				fnOpenDialog();
			};

			if (!oODataModel) {
				var aMockSO = this._getMockSaleOrders();
				this.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
				fnOpenDialog();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZsaleOrdersSet", {
				filters: [new Filter("SalesDocType", FilterOperator.EQ, "ZAOM")],
				urlParameters: { "$expand": "SaleodrItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					if (oData && oData.results && oData.results.length > 0) {
						fnProcessResults(oData.results);
					} else {
						var aMockSO = that._getMockSaleOrders();
						that.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
						fnOpenDialog();
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Error loading Sale Orders. Using mock fallback.");
					var aMockSO = that._getMockSaleOrders();
					that.getView().setModel(new JSONModel({ results: aMockSO }), "sos");
					fnOpenDialog();
				}
			});
		},

		onSaleOrderValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("saleOrder", FilterOperator.Contains, sValue),
					new Filter("vendorName", FilterOperator.Contains, sValue),
					new Filter("remarks", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onSaleOrderValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedSO = oSelectedItem.getBindingContext("sos").getObject();
			this._fillFromSaleOrder(oSelectedSO);
		},

		onSaleOrderValueHelpCancel: function () {},

		onSaleOrderChange: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			if (!sValue) {
				var oModel = this.getView().getModel("scrap");
				oModel.setProperty("/saleOrder", "");
				oModel.setProperty("/vehicleDetails", "");
				oModel.setProperty("/collectArea", "");
				oModel.setProperty("/remarks", "");
				oModel.setProperty("/items", [
					{
						sno: "1",
						type: "",
						description: "",
						quantity: "",
						uom: "KG"
					}
				]);
				return;
			}

			var oSosModel = this.getView().getModel("sos");
			var aSaleOrders = oSosModel ? oSosModel.getProperty("/results") : this._getMockSaleOrders();

			var oSelectedSO = aSaleOrders.find(function (so) {
				return so.saleOrder === sValue;
			});

			if (oSelectedSO) {
				this._fillFromSaleOrder(oSelectedSO);
			} else {
				var oODataModel = this.getOwnerComponent().getModel();
				var that = this;
				if (oODataModel) {
					sap.ui.core.BusyIndicator.show(0);
					oODataModel.read("/ZsaleOrdersSet", {
						filters: [
							new Filter("SalesDocType", FilterOperator.EQ, "ZAOM"),
							new Filter("SalesDocument", FilterOperator.EQ, sValue)
						],
						urlParameters: { "$expand": "SaleodrItmNav" },
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							var oItem = oData && oData.results && oData.results[0];
							if (oItem) {
								var aItemsRaw = [];
								if (oItem.SaleodrItmNav) {
									if (Array.isArray(oItem.SaleodrItmNav)) {
										aItemsRaw = oItem.SaleodrItmNav;
									} else if (oItem.SaleodrItmNav.results && Array.isArray(oItem.SaleodrItmNav.results)) {
										aItemsRaw = oItem.SaleodrItmNav.results;
									}
								}
								var aItemsMapped = aItemsRaw.map(function (subItem, idx) {
									var sRawType = subItem.MaterialType || subItem.Type || subItem.Matkl || "";
									var sType = "Metal";
									if (sRawType) {
										var aKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
										var sLower = sRawType.toLowerCase();
										var sFound = aKeys.find(function(k) {
											return k.toLowerCase() === sLower || sLower.indexOf(k.toLowerCase()) !== -1;
										});
										sType = sFound || "Metal";
									}
									
									var sRawUom = (subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "").toUpperCase();
									var sUom = "KG";
									if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
										sUom = "KG";
									} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
										sUom = "L";
									} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
										sUom = "MT";
									}

									return {
										sno: String(idx + 1),
										type: sType,
										description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
										quantity: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										availQty: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										uom: sUom
									};
								});

								var oMapped = {
									saleOrder: oItem.SalesDocument || oItem.Vbeln || oItem.SalesOrder || "",
									vehicleDetails: oItem.VehicleDetails || oItem.VehicleNo || "",
									collectArea: oItem.CollectArea || oItem.StorageLocation || oItem.Lgort || "",
									remarks: oItem.Remarks || oItem.Description || oItem.HeaderTxt || oItem.Text || "",
									vendor: oItem.SoldToParty || oItem.Customer || oItem.Kunnr || oItem.Vendor || "",
									vendorName: oItem.CustomerName || oItem.Name1 || oItem.VendorName || "",
									vendorAddress: oItem.CustomerAddress || oItem.Address || oItem.Street || "",
									vendorGST: oItem.CustomerGST || oItem.CustomerGst || oItem.Gst || oItem.Stcd3 || "",
									city: oItem.City || "",
									postalCode: oItem.PostalCode || "",
									items: aItemsMapped
								};

								that._fillFromSaleOrder(oMapped);
							} else {
								MessageToast.show("Invalid Sale Order. Please select from F4 help.");
								var oModel = that.getView().getModel("scrap");
								oModel.setProperty("/saleOrder", "");
							}
						},
						error: function (oError) {
							sap.ui.core.BusyIndicator.hide();
							MessageToast.show("Invalid Sale Order. Please select from F4 help.");
							var oModel = that.getView().getModel("scrap");
							oModel.setProperty("/saleOrder", "");
						}
					});
				} else {
					MessageToast.show("Invalid Sale Order. Please select from F4 help.");
					var oModel = this.getView().getModel("scrap");
					oModel.setProperty("/saleOrder", "");
				}
			}
		},

		_fillFromSaleOrder: function (oSelectedSO) {
			var oModel = this.getView().getModel("scrap");
			if (oSelectedSO) {
				oModel.setProperty("/saleOrder", oSelectedSO.saleOrder || "");
				oModel.setProperty("/vehicleDetails", oSelectedSO.vehicleDetails || "");
				oModel.setProperty("/collectArea", oSelectedSO.collectArea || "");
				oModel.setProperty("/remarks", oSelectedSO.remarks || "");
				oModel.setProperty("/vendor", oSelectedSO.vendor || "");
				oModel.setProperty("/vendorName", oSelectedSO.vendorName || "");
				oModel.setProperty("/vendorGST", oSelectedSO.vendorGST || "");
				oModel.setProperty("/city", oSelectedSO.city || "");
				oModel.setProperty("/postalCode", oSelectedSO.postalCode || "");
				
				if (oSelectedSO.items && oSelectedSO.items.length > 0) {
					var aItems = oSelectedSO.items.map(function (item, idx) {
						return {
							sno: String(idx + 1),
							type: item.type || "",
							description: item.description || "",
							quantity: item.quantity || "",
							uom: item.uom || "KG"
						};
					});
					oModel.setProperty("/items", aItems);
				}
				MessageToast.show("Sale Order details auto-filled successfully.");
			}
		}

	});
});
