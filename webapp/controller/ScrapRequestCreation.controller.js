sap.ui.define(["./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, Fragment) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapRequestCreation", {

		onInit: function () {
			this._loadMaterials();
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapRequestCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
			this._loadMaterials();
		},

		_loadMaterials: function () {
			var aDefaultMaterials = [
				{ Material: "MAT-SCRAP-01", MaterialName: "METAL", UOM: "KILOGRAM" },
				{ Material: "MAT-SCRAP-02", MaterialName: "RUBBER SCRAP", UOM: "KILOGRAM" },
				{ Material: "MAT-SCRAP-03", MaterialName: "WASTE OIL", UOM: "LITRE" },
				{ Material: "MAT-SCRAP-04", MaterialName: "PLASTIC SCRAP", UOM: "KILOGRAM" },
				{ Material: "MAT-SCRAP-05", MaterialName: "COPPER SCRAP", UOM: "KILOGRAM" },
				{ Material: "MAT-SCRAP-06", MaterialName: "USED BATTERIES", UOM: "EA" },
				{ Material: "MAT-SCRAP-07", MaterialName: "320 OIL", UOM: "LITRE" }
			];

			var oMaterialsModel = this.getView() ? this.getView().getModel("materials") : null;
			if (!oMaterialsModel) {
				oMaterialsModel = new JSONModel({ results: aDefaultMaterials });
				if (this.getView()) {
					this.getView().setModel(oMaterialsModel, "materials");
				}
			} else if (!oMaterialsModel.getProperty("/results") || oMaterialsModel.getProperty("/results").length === 0) {
				oMaterialsModel.setProperty("/results", aDefaultMaterials);
			}

			sap.ui.getCore().setModel(oMaterialsModel, "materials");

			if (this.getOwnerComponent()) {
				this.getOwnerComponent().setModel(oMaterialsModel, "materials");
			}

			var oODataModel = this.getOwnerComponent() ? this.getOwnerComponent().getModel() : null;
			if (!oODataModel) {
				return;
			}

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? (oUserModel.getProperty("/plant") || oUserModel.getProperty("/Plant") || "") : "";
			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			var that = this;
			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZMaterialSet", {
				filters: aFilters,
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length > 0) {
						var aMapped = aResults.map(function (m) {
							var sCode = m.Material || m.Matnr || "";
							var sName = m.MaterialDesc || m.MaterialDescription || m.Maktx || m.MaterialName || m.Description || sCode;
							var sUom = that._normalizeUOM ? that._normalizeUOM(m.Uom || m.Meins || m.UOM || "KG") : (m.Uom || m.Meins || m.UOM || "KG");
							return {
								Material: sCode || sName,
								MaterialName: sName,
								UOM: sUom
							};
						});
						oMaterialsModel.setProperty("/results", aMapped);
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
				}
			});
		},

		onDescriptionValueHelp: function (oEvent) {
			this._oValueHelpInput = oEvent.getSource();
			this._oValueHelpContext = this._oValueHelpInput.getBindingContext("scrap");

			var oMatModel = (this.getView() ? this.getView().getModel("materials") : null) || sap.ui.getCore().getModel("materials");
			if (!oMatModel || !oMatModel.getProperty("/results") || oMatModel.getProperty("/results").length === 0) {
				this._loadMaterials();
				oMatModel = (this.getView() ? this.getView().getModel("materials") : null) || sap.ui.getCore().getModel("materials");
			}

			var that = this;
			if (!this._pDescriptionValueHelp) {
				this._pDescriptionValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.ScrapDescriptionValueHelp",
					controller: this
				}).then(function (oDialog) {
					that.getView().addDependent(oDialog);
					return oDialog;
				});
			}

			this._pDescriptionValueHelp.then(function (oDialog) {
				if (oMatModel) {
					oDialog.setModel(oMatModel, "materials");
				}
				var oBinding = oDialog.getBinding("items");
				if (oBinding) {
					oBinding.filter([]);
				}
				oDialog.open();
			});
		},

		onDescriptionValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value") || "";
			var oBinding = oEvent.getSource().getBinding("items");
			if (!oBinding) { return; }

			if (sValue.trim()) {
				var oFilter = new Filter({
					filters: [
						new Filter("Material", FilterOperator.Contains, sValue),
						new Filter("MaterialName", FilterOperator.Contains, sValue)
					],
					and: false
				});
				oBinding.filter([oFilter]);
			} else {
				oBinding.filter([]);
			}
		},

		onDescriptionValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem || !this._oValueHelpContext) { return; }

			var oObj = oSelectedItem.getBindingContext("materials").getObject();
			var sPath = this._oValueHelpContext.getPath();
			var oModel = this.getView().getModel("scrap");

			if (oObj) {
				var sDesc = oObj.MaterialName || oObj.Material || "";
				var sUom = oObj.UOM || "KG";

				oModel.setProperty(sPath + "/description", sDesc);
				oModel.setProperty(sPath + "/uom", sUom);

				// Auto-map Material Type if possible
				if (this._mapMaterialType) {
					var sMappedType = this._mapMaterialType(oObj.Material || "", sDesc);
					if (sMappedType) {
						oModel.setProperty(sPath + "/type", sMappedType);
					}
				}
			}
		},

		onDescriptionValueHelpCancel: function () {},

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

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

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
						
						return {
							sno: String(idx + 1),
							type: sType,
							description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
							quantity: (subItem.OrderQuantity || "0").toString(),
							availQty: (subItem.OrderQuantity || "0").toString(),
							uom: that._normalizeUOM(subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "")
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
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
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
						that.getView().setModel(new JSONModel({ results: [] }), "sos");
						MessageToast.show("No Sale Orders found.");
						fnOpenDialog();
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Failed to load Sale Orders. Please try again.";
					try {
						var oErr = JSON.parse(oError.responseText);
						if (oErr && oErr.error && oErr.error.message) {
							sMsg = oErr.error.message.value;
						}
					} catch (e) { }
					MessageBox.error(sMsg);
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
			var aSaleOrders = oSosModel ? oSosModel.getProperty("/results") : [];

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
									
									return {
										sno: String(idx + 1),
										type: sType,
										description: subItem.MaterialDesc || subItem.Arktx || subItem.Description || subItem.Maktx || "",
										quantity: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										availQty: (subItem.OrderQuantity || subItem.Quantity || subItem.Kwmeng || subItem.Qty || "0").toString(),
										uom: that._normalizeUOM(subItem.Uom || subItem.Vrkme || subItem.Meins || subItem.UOM || "")
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
